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
  registry: Pick<Registry, 'list' | 'call' | 'context'>
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


/** What the loop keeps of a finished tool call, keyed by its call id until the stream reports it. */
interface CallOutcome {
  name: string
  ok: boolean
  echo?: string
  refs?: Ref[]
  undo?: () => Promise<void>
  error?: {code: string, message: string}
}


/**
 * @param conversationId
 * @param opts
 * @return the session
 */
function openSession(conversationId: string, opts: AssistOptions): AssistSession {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
  const contextOf: ContextProvider = opts.context ?? (() => opts.registry.context())
  // Undo handles by step, in call order. Kept here, never in the store:
  // they are closures over live view state, meaningless after a reload.
  const undos: Map<string, Array<{name: string, undo: () => Promise<void>}>> = new Map()
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
        console.error('assist: turn failed outside the stream:', e)
        events.push({type: 'error', ...classifyError(e, controller.signal.aborted)})
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
    let stepIndex = -1
    // Steps are counted off the stream's 'start-step' parts, so a tool
    // result's step is the one the stream reports it in. (An approval
    // request is pushed from execute, which can run a beat before the
    // reader has caught up; it can only ever name the same step or the one
    // before it, and nothing undoes by an approval's step.)
    const stepIdOf = () => `${turnNumber}.${Math.max(0, stepIndex)}`
    const {tools, nameOf} = toolSet(opts.registry.list(), {
      stepId: stepIdOf,
      push: (event) => events.push(event),
      registry: opts.registry,
      policy: opts.policy,
      outcomes,
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
    const result = streamText({
      model,
      instructions: instructionsNow(),
      messages: [...history, userMessage],
      tools,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: controller.signal,
      ...(opts.maxRetries === undefined ? {} : {maxRetries: opts.maxRetries}),
      // The view changes as tools run, so each step gets the context as it
      // is now ("Selection: 7" after a select), not as it was at send.
      prepareStep: () => ({instructions: instructionsNow()}),
      // Errors are read from the stream below; without this the SDK also
      // logs each one to the console.
      onError: () => undefined,
    })

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'start-step':
            stepIndex++
            break
          case 'text-delta':
            if (part.text) {
              events.push({type: 'text-delta', stepId: stepIdOf(), text: part.text})
            }
            break
          case 'tool-call':
            events.push({type: 'tool-call', stepId: stepIdOf(), callId: part.toolCallId,
              name: nameOf(part.toolName), input: part.input})
            break
          case 'tool-result':
          case 'tool-error': {
            const outcome = outcomes.get(part.toolCallId) ?? {
              // Only reachable for a call execute never saw (the SDK refused
              // it before running, e.g. unparseable arguments).
              name: nameOf(part.toolName), ok: false,
              error: {code: 'invalid_input', message: errorMessage((part as {error?: unknown}).error)},
            }
            outcomes.delete(part.toolCallId)
            const stepId = stepIdOf()
            if (outcome.undo) {
              const list = undos.get(stepId) ?? []
              list.push({name: outcome.name, undo: outcome.undo})
              undos.set(stepId, list)
            }
            events.push({
              type: 'tool-result', stepId, callId: part.toolCallId, name: outcome.name, ok: outcome.ok,
              undoable: Boolean(outcome.undo),
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
    events.push({type: 'done', finishReason: failed ? (controller.signal.aborted ? 'aborted' : 'error') :
      String(await result.finishReason)})
  }

  return {
    conversationId,
    send,
    abort: () => current?.abort(),
    canUndo: (stepId) => (undos.get(stepId)?.length ?? 0) > 0,
    undo: async (stepId) => {
      const list = undos.get(stepId) ?? []
      undos.delete(stepId)
      const report: UndoReport = {undone: 0, failed: []}
      for (const {name, undo} of list.reverse()) {
        try {
          await undo()
          report.undone++
        } catch (e) {
          report.failed.push({name, message: errorMessage(e)})
        }
      }
      return report
    },
  }
}


interface ToolHooks {
  stepId: () => string
  push: (event: AssistEvent) => void
  registry: Pick<Registry, 'call'>
  policy?: ApprovalPolicy
  outcomes: Map<string, CallOutcome>
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
      execute: (input: unknown, {toolCallId, abortSignal}) => runTool(descriptor, input, toolCallId, abortSignal, hooks),
    })
  }
  return {tools, nameOf: (wire) => names.get(wire) ?? wire}
}


/**
 * @param descriptor
 * @param input
 * @param callId
 * @param signal
 * @param hooks
 * @return what the model is sent: the result's `content`, or `{error}`
 */
async function runTool(descriptor: ToolDescriptor, input: unknown, callId: string,
  signal: AbortSignal | undefined, hooks: ToolHooks): Promise<unknown> {
  const fail = (error: {code: string, message: string}) => {
    hooks.outcomes.set(callId, {name: descriptor.name, ok: false, error})
    return {error}
  }
  if (descriptor.policy === 'confirm') {
    hooks.push({type: 'approval-request', stepId: hooks.stepId(), callId, name: descriptor.name, input})
    let approved = false
    try {
      approved = Boolean(await hooks.policy?.confirm?.({name: descriptor.name, input,
        annotations: descriptor.annotations}))
    } catch {
      approved = false
    }
    if (!approved) {
      return fail({
        code: 'denied',
        message: `'${descriptor.name}' needs the user's approval, which they did not give, so it was not run. ` +
          'Tell the user it was not done and why; do not retry it.',
      })
    }
  }
  try {
    const result = await hooks.registry.call(descriptor.name, input, signal ? {signal} : {})
    hooks.outcomes.set(callId, {
      name: descriptor.name, ok: true, echo: result.echo, refs: result.refs, undo: result.undo,
    })
    return result.content
  } catch (e) {
    return fail(toolErrorJson(e))
  }
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
