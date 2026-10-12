/**
 * The Assist tool contract (design/new/ai-workspace.md §9, D8; decision D15
 * in §2.1).
 *
 * Assist is built package-shaped inside Share and never imports from outside
 * `src/assist/` (an eslint fence enforces it — see `importBoundary.test.js`).
 * Hosts go the other way: they import Assist and inject `ToolProvider`s whose
 * tools hold all the coupling to live viewer state, behind JSON-in /
 * JSON-out calls. That is what lets this directory move to its own repo as a
 * `git mv` once the agent loop (#1675) settles.
 *
 * The shapes are MCP's on purpose (`inputSchema` is a JSON Schema object,
 * `annotations` follows MCP's tool-annotation idea), so `assist-320` can serve
 * the same registry over postMessage MCP later.
 */


/**
 * A JSON Schema object. Only the subset `schema.ts` validates may appear in a
 * registered tool's `inputSchema`; the registry rejects anything else at
 * registration rather than silently skipping a constraint.
 */
export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[]
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: JSONSchema
  enum?: Array<string | number | boolean | null>
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
}


export type JSONSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'


/**
 * What a tool does to the world, which is all the approval policy
 * (`policy.ts`) reads. Unannotated means unknown, and unknown asks first.
 */
export interface ToolAnnotations {
  /** A query: no state changes. Runs freely. */
  readOnly?: boolean
  /** Changes only what the user is looking at (select, isolate, camera). Runs, undoable. */
  viewState?: boolean
  /** Changes the document (notes, versions, PRs). Needs approval. */
  mutatesDocument?: boolean
  /** Reaches outside the page (email, Collab post, Create job). Needs approval. */
  external?: boolean
  /** Sends rendered pixels to a model (screenshot). Opt-in. */
  sendsPixels?: boolean
}


/**
 * An element reference, opaque to Assist. Hosts define the grammar; Share's
 * is `src/viewer/visibilityRefs.js` (`e<expressID>`, `o1.2.3` STEP
 * occurrences, `n<seg>/…` scene-graph name paths) plus `g<GlobalId>`
 * (design/new/model-edit.md §5). Assist only passes refs through, so a chip
 * the AI shows and a row the user clicks are the same navigation.
 */
export type Ref = string


/** Per-call context the host passes through to `run`. */
export interface ToolContext {
  signal?: AbortSignal
}


export interface ToolResult<O> {
  /** What the model sees: a JSON summary, never geometry or buffers. */
  content: O
  /** What the UI shows: "Hid 48 walls". Rendered from the result, not the model's claim. */
  echo?: string
  /** Element chips. */
  refs?: Ref[]
  /** Reverses this call's view change (viewState tools). */
  undo?: () => Promise<void>
}


export interface Tool<I = unknown, O = unknown> {
  /** Namespaced `<provider id>.<verb>`, e.g. 'view.select'. */
  name: string
  description: string
  inputSchema: JSONSchema
  annotations?: ToolAnnotations
  run(input: I, ctx: ToolContext): Promise<ToolResult<O>>
}


export interface ToolProvider {
  /** Namespace for this provider's tools: every tool name starts with `${id}.`. */
  id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools(): Tool<any, any>[]
  /**
   * Subscribe to changes in `tools()`; returns the unsubscribe. Optional: a
   * provider whose tool list is fixed omits it.
   */
  onChange?(cb: () => void): () => void
}


/** Ambient per-turn state (also Jev's `state`, §12.1). */
export interface ContextBlock {
  id: string
  text: string
  data?: unknown
}


export interface ContextSource {
  id: string
  snapshot(): ContextBlock
}


/** How a call is allowed to proceed (`policy.ts`). */
export type Policy = 'run' | 'runWithUndo' | 'confirm'


/** A tool as the registry lists it: what a model or a UI needs, without `run`. */
export interface ToolDescriptor {
  name: string
  description: string
  inputSchema: JSONSchema
  annotations: ToolAnnotations
  policy: Policy
}
