import {ToolError} from './errors'
import {findNonJson} from './json'
import {policyFor} from './policy'
import {assertSupportedSchema, validate} from './schema'
import {
  ContextBlock,
  ContextSource,
  Policy,
  Tool,
  ToolContext,
  ToolDescriptor,
  ToolProvider,
  ToolResult,
} from './types'


/**
 * The in-page tool registry (ai-workspace.md §9, D8): one place where host
 * providers' tools are combined, named, validated and called. The agent loop
 * (#1675), Jev's intent dispatch (D14) and the dev hook Share's E2E drives
 * all call tools through here, so the guarantees below hold for every caller:
 *
 * - Names are namespaced `<provider id>.<verb>` and unique across providers.
 *   A provider can't register a tool outside its own namespace.
 * - Input is validated against the tool's `inputSchema` BEFORE `run`, so a
 *   tool body never sees a schema-invalid call, and the error lists every
 *   violation (eval #1929: models recover from errors that say what's wrong).
 * - Results are plain JSON under a size cap. A buffer, a class instance or a
 *   cycle in `content` is refused (`json.ts`), never forwarded.
 */


/** Provider ids and verb segments: lowerCamel words, dot-separated for verbs. */
const PROVIDER_ID = /^[a-z][a-zA-Z0-9]*$/
const VERB = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/

/**
 * Backstop on a result's serialized size. Each tool caps its own lists
 * (§9 "Hard result caps"); this catches one that forgot, before it fills a
 * context window. Roughly 8k tokens.
 */
export const DEFAULT_MAX_RESULT_CHARS = 32_000


export interface RegistryOptions {
  contextSources?: ContextSource[]
  maxResultChars?: number
}


export interface Registry {
  /** Every registered tool, without `run`, with its derived policy. */
  list(): ToolDescriptor[]
  has(name: string): boolean
  policyOf(name: string): Policy
  /**
   * Validate `input` and run the named tool.
   *
   * @throws {ToolError} unknown_tool, invalid_input, invalid_result,
   *   result_too_large, aborted — or whatever the tool itself throws
   */
  call(name: string, input?: unknown, ctx?: ToolContext): Promise<ToolResult<unknown>>
  /** Every context source's current snapshot, in registration order. */
  context(): ContextBlock[]
  /** Subscribe to tool-list changes; returns the unsubscribe. */
  onChange(cb: () => void): () => void
  /** Drop provider subscriptions. */
  dispose(): void
}


/**
 * @param providers the host's tool providers
 * @param opts context sources and limits
 * @return the registry
 * @throws {Error} on a malformed provider or tool, or a duplicate name
 */
export function createRegistry(providers: ToolProvider[], opts: RegistryOptions = {}): Registry {
  const contextSources = opts.contextSources ?? []
  const maxResultChars = opts.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS
  const listeners = new Set<() => void>()
  assertUniqueIds(providers.map(({id}) => id), 'provider')
  assertUniqueIds(contextSources.map(({id}) => id), 'context source')
  // Built eagerly so a bad provider fails at assembly, not at first call.
  let tools = indexTools(providers)

  const unsubscribes = providers
    .filter((provider) => typeof provider.onChange === 'function')
    .map((provider) => (provider.onChange as (cb: () => void) => () => void)(() => {
      try {
        tools = indexTools(providers)
      } catch (e) {
        // A provider changed into a clash (a duplicate name). Keep serving
        // the last good index rather than none; the error says which.
        console.error('assist registry: provider change rejected, keeping previous tools:', e)
        return
      }
      listeners.forEach((cb) => cb())
    }))

  const lookup = (name: string): Tool => {
    const tool = tools.get(name)
    if (!tool) {
      throw new ToolError('unknown_tool', `No tool named '${name}'.`, {available: [...tools.keys()]})
    }
    return tool
  }

  return {
    list: () => [...tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {...(tool.annotations ?? {})},
      policy: policyFor(tool.annotations),
    })),
    has: (name) => tools.has(name),
    policyOf: (name) => policyFor(lookup(name).annotations),
    call: async (name, input, ctx = {}) => {
      const tool = lookup(name)
      if (ctx.signal?.aborted) {
        throw new ToolError('aborted', `Call to '${name}' was aborted before it ran.`)
      }
      // A no-argument call often arrives with no arguments object at all.
      const args = input === undefined ? {} : input
      const problems = validate(tool.inputSchema, args)
      if (problems.length > 0) {
        throw new ToolError('invalid_input', `Invalid input for '${name}': ${problems.join('; ')}`,
          {problems, inputSchema: tool.inputSchema})
      }
      const result = await tool.run(args, ctx)
      checkResult(name, result, maxResultChars)
      return result
    },
    context: () => contextSources.map((source) => source.snapshot()),
    onChange: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    dispose: () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe())
      listeners.clear()
    },
  }
}


/**
 * @param ids
 * @param what for the message
 */
function assertUniqueIds(ids: string[], what: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id !== 'string' || !PROVIDER_ID.test(id)) {
      throw new Error(`Invalid ${what} id '${id}': expected lowerCamel letters and digits`)
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate ${what} id '${id}'`)
    }
    seen.add(id)
  }
}


/**
 * @param providers
 * @return tools by name
 * @throws {Error} on a malformed tool or a duplicate name
 */
function indexTools(providers: ToolProvider[]): Map<string, Tool> {
  const byName = new Map<string, Tool>()
  for (const provider of providers) {
    for (const tool of provider.tools()) {
      const name = tool?.name
      if (typeof name !== 'string' || !name.startsWith(`${provider.id}.`) ||
          !VERB.test(name.substring(provider.id.length + 1))) {
        throw new Error(`Provider '${provider.id}': tool name '${name}' must be '${provider.id}.<verb>'`)
      }
      if (byName.has(name)) {
        throw new Error(`Duplicate tool name '${name}'`)
      }
      if (typeof tool.description !== 'string' || tool.description.trim() === '') {
        throw new Error(`Tool '${name}': description is required`)
      }
      if (typeof tool.run !== 'function') {
        throw new Error(`Tool '${name}': run must be a function`)
      }
      try {
        assertSupportedSchema(tool.inputSchema)
      } catch (e) {
        throw new Error(`Tool '${name}': ${(e as Error).message}`)
      }
      // MCP's tool input is always an arguments object.
      if (tool.inputSchema.type !== 'object') {
        throw new Error(`Tool '${name}': inputSchema.type must be 'object'`)
      }
      byName.set(name, tool)
    }
  }
  return byName
}


/**
 * @param name
 * @param result what `run` returned
 * @param maxChars
 * @throws {ToolError} invalid_result or result_too_large
 */
function checkResult(name: string, result: ToolResult<unknown>, maxChars: number): void {
  if (result === null || typeof result !== 'object' || !('content' in result)) {
    throw new ToolError('invalid_result', `Tool '${name}' returned no content.`)
  }
  const problem = findNonJson(result.content)
  if (problem) {
    throw new ToolError('invalid_result',
      `Tool '${name}' returned content that is not plain JSON (${problem}).`, {problem})
  }
  if (result.refs !== undefined &&
      (!Array.isArray(result.refs) || result.refs.some((ref) => typeof ref !== 'string'))) {
    throw new ToolError('invalid_result', `Tool '${name}' returned refs that are not strings.`)
  }
  const size = JSON.stringify(result.content)?.length ?? 0
  if (size > maxChars) {
    throw new ToolError('result_too_large',
      `Tool '${name}' returned ${size} characters (cap ${maxChars}).`, {size, cap: maxChars})
  }
}
