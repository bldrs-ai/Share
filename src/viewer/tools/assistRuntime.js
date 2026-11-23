import {importModuleFromUrl} from '../../export/importModuleFromUrl'


/**
 * Load Assist's lazy half — the agent loop and its transports, which carry
 * the AI SDK — the first time the assistant sends, and only then
 * (ai-workspace.md §9, Amendment 1).
 *
 * `src/assist/runtime.ts` is its own entry of the main build, emitted beside
 * `index.js` as `assist/runtime.js` (tools/esbuild/assistEntry.js). It is
 * reached by a URL built at run time on purpose: a literal
 * `import('../../assist/runtime')` would be inlined into the main bundle,
 * because the build doesn't split (common.js `splitting: false`), and the
 * build's own guard (`assertAiSdkNotInMain`) would then fail it. Resolving
 * against this module's URL keeps it beside whichever `index.js` is
 * running, `/Share/`-prefixed or not, the way the engine worker is found
 * (engine/spawnEngine.js).
 *
 * Jest can't import a URL (importModuleFromUrl.js says why), so tests mock
 * this module with a direct import of `src/assist/runtime`.
 *
 * @return {Promise<object>} the runtime module: `createAssist`, `openRouterTransport`, …
 */
export function loadAssistRuntime() {
  if (!runtime) {
    runtime = importModuleFromUrl(new URL('./assist/runtime.js', import.meta.url).href)
    // A failed fetch (offline at first send) must not stick: the next send retries.
    runtime.catch(() => {
      runtime = null
    })
  }
  return runtime
}


let runtime = null
