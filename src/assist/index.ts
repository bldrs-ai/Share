// Assist's public surface. Hosts import from here, never from the files
// behind it, so the extraction to bldrs-ai/Assist (ai-workspace.md §2.1, D15)
// keeps every host import path but the package name.
//
// Everything here is cheap and SDK-free, because the main bundle imports it.
// The agent loop and its transports need the AI SDK and live in the lazy
// entry, `runtime.ts`, which hosts load by URL (ai-workspace.md §9,
// Amendment 1). Never re-export from `loop.ts`, `transport.ts` or
// `runtime.ts` here: the build's guard (tools/esbuild/assistEntry.js) fails
// when the AI SDK reaches the main bundle. Their TYPES are fine — `import
// type` is erased.
export {AssistError, assistErrorMessage, classifyError} from './assistError'
export type {AssistErrorCode} from './assistError'
export {createMemoryConversationStore} from './conversation'
export type {ConversationStore} from './conversation'
export {ToolError} from './errors'
export {HOSTED_TRANSPORT_ID, HOSTED_TRANSPORT_LABEL, hostedMetaOf, relayError} from './hosted'
export type {HostedMeta} from './hosted'
export type {ToolErrorCode} from './errors'
export {copyJson, findNonJson} from './json'
export {OPENROUTER_KEY_ID, createSessionKeyStore} from './keyStore'
export type {KeyStore} from './keyStore'
export {policyFor} from './policy'
export {DEFAULT_MAX_RESULT_CHARS, createRegistry} from './registry'
export type {Registry, RegistryOptions} from './registry'
export {assertSupportedSchema, validate} from './schema'
export {wireToolName} from './session'
export type {
  ApprovalPolicy,
  ApprovalRequest,
  AssistEvent,
  AssistSession,
  ContextProvider,
  UndoReport,
} from './session'
export type {Assist, AssistOptions} from './loop'
export type {HostedTransportOptions, OpenRouterTransportOptions, Transport} from './transport'
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
