/**
 * Every failure a tool call surfaces, typed by `code` so a host can branch on
 * it and a model can read it. Eval #1929 (ai-workspace.md §9) is why the
 * `details` matter: the models that recovered from a bad call were the ones
 * whose error listed the valid arguments, and the ones that gave up after one
 * error are the ones that failed the task. So an error names what WOULD have
 * worked — the known tools, the schema violations, the refs that didn't
 * resolve and the grammar they should follow.
 */
export type ToolErrorCode =
  /** No tool by that name; `details.available` lists the names. */
  | 'unknown_tool'
  /** Input failed the tool's `inputSchema`; `details.problems` lists each violation. */
  | 'invalid_input'
  /** The tool returned something that isn't plain JSON (a buffer, a class instance, a cycle). */
  | 'invalid_result'
  /** The result is past the registry's size cap. */
  | 'result_too_large'
  /** The call's AbortSignal fired before it ran. */
  | 'aborted'
  /** Some refs don't name anything in the loaded model; `details.unresolved` lists them. */
  | 'unresolved_refs'
  /** A ref kind this tool or this model can't act on. */
  | 'unsupported_ref'
  /** The host isn't ready (no model loaded, no viewer). */
  | 'not_ready'
  /** The call is valid but would have no effect, or contradicts the current view state. */
  | 'rejected'
  /** An undo whose state is gone: the host replaced what it changed (another model loaded). */
  | 'expired'


/** An error a tool call reports. Thrown by the registry and by tools. */
export class ToolError extends Error {
  code: ToolErrorCode
  details: Record<string, unknown>


  /**
   * @param code
   * @param message one sentence a model can act on
   * @param details structured specifics (valid arguments, offending refs)
   */
  constructor(code: ToolErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ToolError'
    this.code = code
    this.details = details
  }


  /** @return the error as plain JSON, for a tool-result message or a test assertion */
  toJSON(): {code: ToolErrorCode, message: string, details: Record<string, unknown>} {
    return {code: this.code, message: this.message, details: this.details}
  }
}
