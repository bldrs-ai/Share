// Assist's public surface. Hosts import from here, never from the files
// behind it, so the extraction to bldrs-ai/Assist (ai-workspace.md §2.1, D15)
// keeps every host import path but the package name.
export {ToolError} from './errors'
export type {ToolErrorCode} from './errors'
export {copyJson, findNonJson} from './json'
export {policyFor} from './policy'
export {DEFAULT_MAX_RESULT_CHARS, createRegistry} from './registry'
export type {Registry, RegistryOptions} from './registry'
export {assertSupportedSchema, validate} from './schema'
export type {
  ContextBlock,
  ContextSource,
  JSONSchema,
  JSONSchemaType,
  Policy,
  Ref,
  Tool,
  ToolAnnotations,
  ToolContext,
  ToolDescriptor,
  ToolProvider,
  ToolResult,
} from './types'
