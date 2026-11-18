import type {AssistErrorCode} from './assistError'
import type {ContextBlock, Ref, ToolAnnotations} from './types'


/**
 * The agent loop's public shapes (ai-workspace.md §9, "Entry point" and
 * "Event stream"). They live apart from `loop.ts` so the host can type its
 * side from the main bundle; the loop itself is only in the lazy bundle
 * (`runtime.ts`).
 *
 * A turn is one `send`. A step is one model call within it plus the tool
 * calls that call made; the loop runs up to `maxSteps` of them, stopping
 * early when the model answers without calling a tool. `stepId` names a step
 * across the session (`<turn>.<step>`), and is what `undo` takes.
 */
export type AssistEvent =
  | {type: 'text-delta', stepId: string, text: string}
  | {type: 'tool-call', stepId: string, callId: string, name: string, input: unknown}
  /**
   * A call the policy says needs the user's approval (ai-workspace.md §9,
   * "Approval policy"). The loop asks `policy.confirm`, which denies by
   * default; a denial is reported to the model, which tells the user.
   */
  | {type: 'approval-request', stepId: string, callId: string, name: string, input: unknown}
  /**
   * `ok` false carries the error the model was sent: the registry's
   * `ToolError` JSON, or `code: 'denied'` when approval was not given.
   * `echo` is what the UI shows ("Selected 7 elements"), from the tool's own
   * result, never from the model's account of it (eval #1929, §9).
   */
  | {type: 'tool-result', stepId: string, callId: string, name: string, ok: boolean,
      echo?: string, refs?: Ref[], undoable: boolean, error?: {code: string, message: string}}
  | {type: 'usage', inputTokens?: number, outputTokens?: number, totalTokens?: number}
  | {type: 'error', code: AssistErrorCode, status?: number}
  | {type: 'done', finishReason: string}


/** What `session.undo(stepId)` did. */
export interface UndoReport {
  /** Tool calls reversed, latest first. */
  undone: number
  /** Calls whose undo threw (their state was replaced, e.g. another model loaded). */
  failed: Array<{name: string, message: string}>
}


export interface AssistSession {
  readonly conversationId: string
  /**
   * Run one turn. The iterator ends after `done`; breaking out of it early
   * aborts the turn.
   */
  send(text: string): AsyncIterable<AssistEvent>
  /** Stop the turn in flight, if any. Its events end with `error` 'aborted' and `done`. */
  abort(): void
  /** Reverse the view changes a step made, latest call first. A step undoes once. */
  undo(stepId: string): Promise<UndoReport>
  /** Whether a step still has something to undo. */
  canUndo(stepId: string): boolean
}


/** What `policy.confirm` is asked. */
export interface ApprovalRequest {
  name: string
  input: unknown
  annotations: ToolAnnotations
}


export interface ApprovalPolicy {
  /**
   * Whether a tool whose policy is 'confirm' may run. Optional: without it
   * every such call is denied, which is v0's behaviour (#1675: "until
   * approval exists, they are declined, and the assistant says so").
   */
  confirm?: (request: ApprovalRequest) => Promise<boolean>
}


/** A per-turn context provider: the registry's sources by default. */
export type ContextProvider = () => ContextBlock[]


/**
 * The tool name the model sees. Registry names are `<provider>.<verb>`, but
 * the function-calling APIs behind every transport (OpenAI-shape and
 * Anthropic alike) allow only `[a-zA-Z0-9_-]` in a tool name, so the dots
 * become underscores. Registry names never contain an underscore
 * (registry.ts `PROVIDER_ID`, `VERB`), so the mapping is reversible.
 *
 * @param name a registry tool name, e.g. 'view.select'
 * @return the wire name, e.g. 'view_select'
 */
export function wireToolName(name: string): string {
  return name.replace(/\./g, '_')
}
