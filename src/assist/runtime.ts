/**
 * The lazy half of Assist: everything that needs the AI SDK. Built as its own
 * esbuild entry (`tools/esbuild/assistEntry.js`) into `docs/assist/runtime.js`
 * and fetched only when the assistant first sends (ai-workspace.md §9,
 * Amendment 1: with `splitting: false`, a literal `import()` of this from the
 * app would be inlined into the main bundle, +196 KB gz on cold load).
 *
 * So the rule is: the main bundle reaches this module only through a
 * runtime-built URL (Share's `viewer/tools/assistRuntime.js`), never by an
 * import. `index.ts` must not re-export from here, and the build fails if the
 * AI SDK shows up among the main bundle's inputs (`assistEntry.js`
 * `assertAiSdkNotInMain`).
 */
export {DEFAULT_MAX_STEPS, createAssist} from './loop'
export type {Assist, AssistOptions} from './loop'
export {openRouterTransport} from './transport'
export type {OpenRouterTransportOptions, Transport} from './transport'
