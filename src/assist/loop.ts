import {jsonSchema, stepCountIs, streamText, tool} from 'ai'
import type {JSONSchema7, ModelMessage, ToolSet} from 'ai'
import {AssistError, classifyError} from './assistError'
import type {ConversationStore} from './conversation'
import type {Registry} from './registry'
import {wireToolName} from './session'
import type {
  ApprovalPolicy,
  AssistEvent,
  AssistSession,
  ContextProvider,
  UndoReport,
} from './session'
import type {Transport} from './transport'
import type {ContextBlock, Ref, ToolDescriptor} from './types'


/**
 * The agent loop (#1675; ai-workspace.md D1 §4, D7 §9): the user's turn
 * goes to the model with the registry's tools; the model's tool calls run
 * in the page through `registry.call`, their results go back to the model,
 * and that repeats until the model answers in text or the step cap is hit.
 * Only the model call leaves the browser (D1): the model, OPFS and geometry
 * never do, because tools return JSON summaries and the registry refuses
 * anything else (`json.ts`, D9).
 *
 * Built on the AI SDK's `streamText` with a `stopWhen` step cap rather than a
 * loop of our own: spike #1927 found it the one client whose stream, tool
 * round trip, multi-step loop, multi-turn history and abort all passed with
 * library code alone. This module imports `ai`, so it is only in the lazy
 * bundle (`runtime.ts`, built as its own entry: ai-workspace.md §9
 * Amendment 1). Nothing in the main bundle may import it.
 *
 * ai@7 specifics this relies on (spike #1927):
 * - the system prompt goes in `instructions`, since a system message inside
 *   `messages` throws without `allowSystemInMessages`;
 * - history is `result.responseMessages` (every step), not
 *   `(await result.response).messages` (the last step only).
 */


export interface AssistOptions {
  transport: Transport
  /** The host's tool registry; calls go through it so validation, the result guard and policy apply. */
  registry: Pick<Registry, 'list' | 'call' | 'context' | 'policyOf'>
  store: ConversationStore
  /** The system prompt. The context blocks are appended to it at every step. */
  instructions: string
  /** Per-step ambient state; defaults to the registry's context sources. */
  context?: ContextProvider
  policy?: ApprovalPolicy
  /** Most model calls in one turn. */
  maxSteps?: number
  /** The AI SDK's retries of a failed request (429, 5xx, network) before the error surfaces. */
  maxRetries?: number
}


export interface Assist {
  open(conversationId: string): AssistSession
}


/**
 * Model calls a turn may make. A select-then-isolate-then-frame request is 3
 * tool steps plus the answer; eval #1929's two-tool tasks needed at most 4.
 * The cap is what stops a model looping on a tool that keeps failing.
 */
export const DEFAULT_MAX_STEPS = 8


/**
 * @param opts
 * @return the assistant: `open(conversationId)` gives a session
 */
export function createAssist(opts: AssistOptions): Assist {
  return {open: (conversationId) => openSession(conversationId, opts)}
}


/**
 * Messages from turns older than this many are sent with their tool results
 * cut to a stub (`wireHistory`). The store keeps them whole (D10); only what
 * goes over the wire is bounded, because a result can be up to the
 * registry's 32k-character cap and a turn can make eight of them.
 */
export const FULL_RESULT_TURNS = 3
/** Turns of history sent at all; older ones stay in the store, unsent. */
export const MAX_WIRE_TURNS = 30
const STUB_RESULT = 'Result of an earlier turn, omitted to save space. Call the tool again if you need it.'


/** What the loop keeps of a finished tool call, keyed by its call id until the stream reports it. */
interface CallOutcome {
  name: string
  stepId: string
  ok: boolean
  echo?: string
  refs?: Ref[]
  /** Whether the call's undo was kept: false when it was rolled back as it landed. */
  undoable: boolean
  error?: {code: string, message: string}
}


/** A step's undo handles, in call order, and whether the step has been undone. */
interface StepRecord {
  id: string
  calls: Array<{name: string, undo: () => Promise<void>}>
  undone: boolean
}


/**
 * @param conversationId
 * @param opts
 * @return the session
 */
function openSession(conversationId: string, opts: AssistOptions): AssistSession {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
  const contextOf: ContextProvider = opts.context ?? (() => opts.registry.context())
  // Undo handles by step, oldest step first, across every turn: undo is a
  // stack (session.ts). Kept here, never in the store: they are closures
  // over live view state, meaningless after a reload.
  const steps: StepRecord[] = []
  const stepRecord = (id: string): StepRecord => {
    let record = steps.find((step) => step.id === id)
    if (!record) {
      record = {id, calls: [], undone: false}
      steps.push(record)
    }
    return record
  }
  const undoable = (record: StepRecord) => !record.undone && record.calls.length > 0
  let turn = 0
  let current: AbortController | null = null

  const send = (text: string): AsyncIterable<AssistEvent> => {
    if (current) {
      return once({type: 'error', code: 'busy'}, {type: 'done', finishReason: 'error'})
    }
    const controller = new AbortController()
    current = controller
    turn++
    const events = channel<AssistEvent>(() => controller.abort())
    runTurn(turn, text, controller, events)
      .catch((e) => {
        // runTurn reports its own failures as events; reaching here is a bug
        // in it, and the session must still end the turn rather than hang.
        // Only the classification is logged: an SDK error carries the request
        // body, which is the conversation, and a console line becomes a
        // Sentry breadcrumb.
        const classified = classifyError(e, controller.signal.aborted)
        console.error('assist: turn failed outside the stream:', classified)
        events.push({type: 'error', ...classified})
        events.push({type: 'done', finishReason: 'error'})
      })
      .finally(() => {
        if (current === controller) {
          current = null
        }
        events.close()
      })
    return events
  }

  /**
   * @param turnNumber
   * @param text the user's message
   * @param controller this turn's abort
   * @param events where the turn's events go
   */
  async function runTurn(turnNumber: number, text: string, controller: AbortController, events: Channel<AssistEvent>) {
    const userMessage: ModelMessage = {role: 'user', content: text}
    const history = await opts.store.load(conversationId)
    let model
    try {
      model = opts.transport.model()
    } catch (e) {
      // No key: nothing was sent, so nothing is kept either; the user's
      // retry after adding one is the turn.
      events.push({type: 'error', ...classifyError(e)})
      events.push({type: 'done', finishReason: 'error'})
      return
    }
    const outcomes = new Map<string, CallOutcome>()
    // Two step counters, each exact for what it labels:
    // - `streamStep` counts the stream's 'start-step' parts, for the parts the
    //   reader reads (text, tool calls), which are in stream order;
    // - `execStep` is set by prepareStep just before each model call, for
    //   what tool execution does (approval requests, undo handles), which
    //   can run ahead of the reader.
    let streamStep = 0
    let execStep = 0
    let started = false
    const streamStepId = () => `${turnNumber}.${streamStep}`
    const execStepId = () => `${turnNumber}.${execStep}`
    const {tools, nameOf} = toolSet(opts.registry.list(), {
      stepId: execStepId,
      push: (event) => events.push(event),
      registry: opts.registry,
      policy: opts.policy,
      outcomes,
      stepRecord,
    })
    const instructionsNow = () => withContext(opts.instructions, contextOf())

    // One error event per turn: an abort, say, can surface both as the
    // stream's 'abort' part and as a rejection of what follows it.
    let failed = false
    const fail = (event: AssistEvent & {type: 'error'}) => {
      if (!failed) {
        failed = true
        events.push(event)
      }
    }
    let stepsRun = 0
    const result = streamText({
      model,
      instructions: instructionsNow(),
      messages: [...wireHistory(history), userMessage],
      tools,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: controller.signal,
      ...(opts.maxRetries === undefined ? {} : {maxRetries: opts.maxRetries}),
      // The view changes as tools run, so each step gets the context as it
      // is now ("Selection: 7" after a select), not as it was at send.
      prepareStep: ({stepNumber}) => {
        execStep = stepNumber
        return {instructions: instructionsNow()}
      },
      // Errors are read from the stream below; without this the SDK also
      // logs each one to the console.
      onError: () => undefined,
    })

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'start-step':
            if (started) {
              streamStep++
            }
            started = true
            stepsRun++
            break
          case 'text-delta':
            if (part.text) {
              events.push({type: 'text-delta', stepId: streamStepId(), text: part.text})
            }
            break
          case 'tool-call':
            events.push({type: 'tool-call', stepId: streamStepId(), callId: part.toolCallId,
              name: nameOf(part.toolName), input: part.input})
            break
          case 'tool-result':
          case 'tool-error': {
            const outcome = outcomes.get(part.toolCallId) ?? refusedCall(part, nameOf, streamStepId())
            outcomes.delete(part.toolCallId)
            events.push({
              type: 'tool-result', stepId: outcome.stepId, callId: part.toolCallId, name: outcome.name,
              ok: outcome.ok, undoable: outcome.undoable,
              ...(outcome.echo === undefined ? {} : {echo: outcome.echo}),
              ...(outcome.refs === undefined ? {} : {refs: outcome.refs}),
              ...(outcome.error === undefined ? {} : {error: outcome.error}),
            })
            break
          }
          case 'finish': {
            const usage = part.totalUsage ?? {}
            events.push({type: 'usage', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens})
            break
          }
          case 'abort':
            fail({type: 'error', code: 'aborted'})
            break
          case 'error':
            fail({type: 'error', ...classifyError(part.error, controller.signal.aborted)})
            break
          default:
            break
        }
      }
    } catch (e) {
      fail({type: 'error', ...classifyError(e, controller.signal.aborted)})
    }

    // History. A finished turn keeps the user's message and every step's
    // response messages whole (D10: providerOptions included). A failed or
    // stopped one keeps only the user's message: its steps can end in a
    // tool call whose result never came, and providers reject a history
    // holding one. The view state those calls left is in the next turn's
    // context block anyway.
    let response: ModelMessage[] = []
    if (!failed) {
      try {
        response = await result.responseMessages as ModelMessage[]
      } catch (e) {
        fail({type: 'error', ...classifyError(e, controller.signal.aborted)})
      }
    }
    await opts.store.append(conversationId, failed ? [userMessage] : [userMessage, ...response])
    if (failed) {
      events.push({type: 'done', finishReason: controller.signal.aborted ? 'aborted' : 'error'})
      return
    }
    const finishReason = String(await result.finishReason)
    // Only the step cap ends a turn whose last step still called tools.
    if (finishReason === 'tool-calls' && stepsRun >= maxSteps) {
      events.push({type: 'step-limit', steps: stepsRun})
    }
    events.push({type: 'done', finishReason})
  }

  return {
    conversationId,
    send,
    abort: () => current?.abort(),
    canUndo: (stepId) => {
      const record = steps.find((step) => step.id === stepId)
      return Boolean(record && undoable(record))
    },
    lastUndoable: () => [...steps].reverse().find(undoable)?.id ?? null,
    undo: async (stepId) => {
      const report: UndoReport = {undone: 0, failed: [], steps: []}
      const index = steps.findIndex((step) => step.id === stepId)
      if (index < 0 || !undoable(steps[index])) {
        return report
      }
      // Newest first, down to and including the one asked for: undoing an
      // older step's snapshot alone would bring back state a newer step's
      // undo had already taken away.
      for (const record of steps.slice(index).reverse()) {
        if (!undoable(record)) {
          record.undone = true
          continue
        }
        record.undone = true
        report.steps.push(record.id)
        for (const {name, undo} of [...record.calls].reverse()) {
          try {
            await undo()
            report.undone++
          } catch (e) {
            report.failed.push({name, message: errorMessage(e)})
          }
        }
      }
      return report
    },
  }
}


/**
 * The outcome of a call the SDK refused before running it: a tool name the
 * set doesn't have (an invented one, or a registry name with its dots), or
 * arguments that aren't JSON. The registry is never called for these.
 *
 * @param part the stream's tool-error part
 * @param nameOf wire name → registry name
 * @param stepId
 * @return the outcome
 */
function refusedCall(part: {toolName: string, error?: unknown}, nameOf: (wire: string) => string,
  stepId: string): CallOutcome {
  // The stream reports this error as its string form ("AI_NoSuchToolError:
  // Model tried to call unavailable tool …"), not the error object.
  const unknown = (part.error as {name?: string} | undefined)?.name === 'AI_NoSuchToolError' ||
    String(part.error).startsWith('AI_NoSuchToolError')
  return {
    name: nameOf(part.toolName), stepId, ok: false, undoable: false,
    error: {code: unknown ? 'unknown_tool' : 'invalid_input', message: errorMessage(part.error)},
  }
}


/**
 * What of the stored history goes over the wire. The store keeps every
 * message whole (D10); this bounds the request so a long conversation
 * doesn't grow past the model's context window and fail every turn after:
 * only the last {@link MAX_WIRE_TURNS} turns are sent, and in all but the
 * last {@link FULL_RESULT_TURNS} each tool result is cut to a stub. The
 * tool calls themselves stay, so every call still has its result, which
 * providers require. A turn starts at a user message, so the cut never
 * splits one.
 *
 * @param history the stored messages
 * @return the messages to send
 */
export function wireHistory(history: ModelMessage[]): ModelMessage[] {
  const turnStarts = history.flatMap((message, index) => (message.role === 'user' ? [index] : []))
  const firstSent = turnStarts.length > MAX_WIRE_TURNS ? turnStarts[turnStarts.length - MAX_WIRE_TURNS] : 0
  const firstFull = turnStarts.length > FULL_RESULT_TURNS ?
    turnStarts[turnStarts.length - FULL_RESULT_TURNS] : 0
  return history.slice(firstSent).map((message, offset) => {
    if (firstSent + offset >= firstFull || message.role !== 'tool' || !Array.isArray(message.content)) {
      return message
    }
    return {
      ...message,
      content: message.content.map((part) => (part.type === 'tool-result' ?
        {...part, output: {type: 'text' as const, value: STUB_RESULT}} : part)),
    } as ModelMessage
  })
}


interface ToolHooks {
  stepId: () => string
  push: (event: AssistEvent) => void
  registry: Pick<Registry, 'call' | 'policyOf' | 'list'>
  policy?: ApprovalPolicy
  outcomes: Map<string, CallOutcome>
  stepRecord: (id: string) => StepRecord
}


/**
 * The registry's tools as AI SDK tools. Each schema is passed through as the
 * JSON Schema it already is (`jsonSchema()`, no zod), with no SDK-side
 * validation: `registry.call` validates and its error lists every violation,
 * which is the error a model can act on (eval #1929). Every outcome, failures
 * included, goes back to the model as the tool's result.
 *
 * @param descriptors the registry's list
 * @param hooks
 * @return the tool set, and wire name → registry name
 */
function toolSet(descriptors: ToolDescriptor[], hooks: ToolHooks): {tools: ToolSet, nameOf: (wire: string) => string} {
  const names = new Map<string, string>()
  const tools: ToolSet = {}
  for (const descriptor of descriptors) {
    const wire = wireToolName(descriptor.name)
    names.set(wire, descriptor.name)
    tools[wire] = tool({
      description: descriptor.description,
      inputSchema: jsonSchema(descriptor.inputSchema as JSONSchema7),
      execute: (input: unknown, {toolCallId, abortSignal}) =>
        runTool(descriptor.name, input, toolCallId, abortSignal, hooks),
    })
  }
  return {tools, nameOf: (wire) => names.get(wire) ?? wire}
}


/** The only policies that run without asking; anything else, or nothing, asks. */
const RUNS_WITHOUT_ASKING = new Set(['run', 'runWithUndo'])


/**
 * Run one call. The policy is read from the registry now, not from the
 * turn's tool list, so a provider re-registering a tool mid-turn can't carry
 * an old, laxer policy past the approval check.
 *
 * Stop wins over a slow tool: the call is raced against the turn's signal,
 * and an abort answers the model at once (`aborted`) so the turn ends
 * promptly even when the tool never settles. A call that completes after
 * that, or after its step was undone, is ROLLED BACK as it lands, by its
 * own undo: the user stopped or undid it, so its effect must not appear
 * later with no Undo to take it back. (The other option, keeping it and
 * reporting it late, would need an event after the turn's `done`.)
 *
 * @param name the registry name
 * @param input
 * @param callId
 * @param signal the turn's abort
 * @param hooks
 * @return what the model is sent: the result's `content`, or `{error}`
 */
async function runTool(name: string, input: unknown, callId: string,
  signal: AbortSignal | undefined, hooks: ToolHooks): Promise<unknown> {
  // The step is fixed, and its record made, when the call starts: a call
  // finishing late still belongs to the step that made it, and an undo of
  // that step (or an older one) while it runs marks the record undone.
  const stepId = hooks.stepId()
  const record = hooks.stepRecord(stepId)
  const fail = (error: {code: string, message: string}) => {
    hooks.outcomes.set(callId, {name, stepId, ok: false, undoable: false, error})
    return {error}
  }
  let policy: string | undefined
  try {
    policy = hooks.registry.policyOf(name)
  } catch (e) {
    return fail(toolErrorJson(e))
  }
  if (!RUNS_WITHOUT_ASKING.has(String(policy))) {
    hooks.push({type: 'approval-request', stepId, callId, name, input})
    const annotations = hooks.registry.list().find((descriptor) => descriptor.name === name)?.annotations ?? {}
    let approved = false
    try {
      // Exactly `true`: 'no', {approved: false} and 1 are not approvals.
      approved = (await hooks.policy?.confirm?.({name, input, annotations})) === true
    } catch {
      approved = false
    }
    if (!approved) {
      return fail({
        code: 'denied',
        message: `'${name}' needs the user's approval, which they did not give, so it was not run. ` +
          'Tell the user it was not done and why; do not retry it.',
      })
    }
  }
  const call = hooks.registry.call(name, input, signal ? {signal} : {})
  let settled: {result: Awaited<typeof call>} | null
  try {
    settled = await untilAborted(call, signal)
  } catch (e) {
    return fail(toolErrorJson(e))
  }
  if (!settled) {
    // Stopped while the tool ran. Whatever it does when it finishes is undone then.
    call.then((late) => late.undo?.(), () => undefined).catch(() => undefined)
    return fail({code: 'aborted', message: `'${name}' was stopped before it finished.`})
  }
  const {result} = settled
  let kept = false
  if (result.undo) {
    if (record.undone || signal?.aborted) {
      // The user undid this step, or stopped the turn, while the call ran.
      await result.undo().catch(() => undefined)
    } else {
      record.calls.push({name, undo: result.undo})
      kept = true
    }
  }
  hooks.outcomes.set(callId, {name, stepId, ok: true, echo: result.echo, refs: result.refs, undoable: kept})
  return result.content
}


/**
 * @param promise
 * @param signal
 * @return `{result}` when `promise` settles first, or null when `signal`
 *   fires first (or had already); rejects when `promise` does first
 */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<{result: T} | null> {
  if (!signal) {
    return promise.then((result) => ({result}))
  }
  if (signal.aborted) {
    return Promise.resolve(null)
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve(null)
    signal.addEventListener('abort', onAbort, {once: true})
    promise.then(
      (result) => {
        signal.removeEventListener('abort', onAbort)
        resolve({result})
      },
      (e) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      })
  })
}


/**
 * @param e what a tool call threw
 * @return the error as the model and the UI get it: a `ToolError`'s own
 *   JSON (code, message, details — matched by shape, since the registry's
 *   copy of the class is in the main bundle), else a generic one
 */
function toolErrorJson(e: unknown): {code: string, message: string, details?: unknown} {
  const candidate = e as {name?: string, toJSON?: () => {code: string, message: string, details?: unknown}}
  if (candidate?.name === 'ToolError' && typeof candidate.toJSON === 'function') {
    return candidate.toJSON()
  }
  if (e instanceof AssistError) {
    return {code: e.code, message: e.message}
  }
  return {code: 'error', message: errorMessage(e)}
}


/**
 * @param instructions
 * @param blocks
 * @return the system prompt with each context block appended under its own heading
 */
function withContext(instructions: string, blocks: ContextBlock[]): string {
  if (blocks.length === 0) {
    return instructions
  }
  return [instructions, ...blocks.map((block) => `## Current ${block.id}\n${block.text}`)].join('\n\n')
}


/**
 * @param e
 * @return its message, or its string form
 */
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}


interface Channel<T> extends AsyncIterable<T> {
  push(item: T): void
  close(): void
}


/**
 * A push-to-pull queue: the turn pushes events as they happen (from the
 * stream reader and from tool execution, which can be waiting on an
 * approval), and the host pulls them with `for await`.
 *
 * @param onCancel called when the consumer stops iterating before the end
 * @return the channel
 */
function channel<T>(onCancel: () => void): Channel<T> {
  const items: T[] = []
  let wake: (() => void) | null = null
  let closed = false
  const arrival = () => new Promise<void>((resolve) => {
    wake = resolve
  })
  return {
    push: (item) => {
      if (!closed) {
        items.push(item)
        wake?.()
      }
    },
    close: () => {
      closed = true
      wake?.()
    },
    [Symbol.asyncIterator]: () => ({
      next: async (): Promise<IteratorResult<T>> => {
        while (items.length === 0 && !closed) {
          await arrival()
          wake = null
        }
        return items.length > 0 ? {value: items.shift() as T, done: false} : {value: undefined, done: true}
      },
      return: (): Promise<IteratorResult<T>> => {
        if (!closed) {
          onCancel()
        }
        return Promise.resolve({value: undefined, done: true})
      },
    }),
  }
}


/**
 * @param items
 * @return an iterable of exactly these
 */
function once<T>(...items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve(items.length > 0 ?
        {value: items.shift() as T, done: false} :
        {value: undefined, done: true}),
    }),
  }
}
