// conway#540 shims, until the pinned conway recognises a WorkerGlobalScope
// (conway#759). Imported by `Engine.worker.js` only: on the page, `window`
// already answers both. Remove this module with that pin.
import Logger from '@bldrs-ai/conway/src/logging/logger'


// 1. `isWebPlatform()` is false in a worker (no `window`, no `process`), so
// conway loads the Node wasm and `Init()` dies on a dynamic require of
// `ConwayGeomWasmNode.js`. Declaring `process.env.PLATFORM = 'web'` takes its
// first arm. A bundler `define` cannot do this, because that arm is guarded
// by `typeof process` (engine-worker.md §2.2).
if (typeof globalThis.window === 'undefined') {
  const existing = globalThis.process
  globalThis.process = {...existing, env: {...existing?.env, PLATFORM: 'web'}}
}


// 2. conway's `Environment.checkEnvironment()` classifies a worker as UNKNOWN
// (neither `window` nor Node's `global`), so `Logger.initializeWasmCallbacks()`
// in `Init()` binds nothing, and the wasm glue, which looks `logInfo` /
// `logWarning` / `logError` up on `globalThis` and skips a missing one,
// drops every native diagnostic before it reaches the Logger (and so the
// load report). Bind them here, before `Init()`; on UNKNOWN, Init leaves them
// alone. `Logger` resolves to the same module instance the worker's engine
// logs through: `web-ifc` → compiled/src/compat/web-ifc/ifc_api.js imports
// ../../logging/logger.js, which is this subpath.
for (const [name, fn] of [['logInfo', Logger.info], ['logWarning', Logger.warning], ['logError', Logger.error]]) {
  if (typeof globalThis[name] !== 'function') {
    globalThis[name] = fn
  }
}
