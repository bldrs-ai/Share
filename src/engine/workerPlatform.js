// conway#540: until the pinned conway recognises a WorkerGlobalScope, its
// `isWebPlatform()` is false in a worker (no `window`, no `process`), so it
// loads the Node wasm and `Init()` dies on a dynamic require of
// `ConwayGeomWasmNode.js`. Declaring `process.env.PLATFORM = 'web'` takes its
// first arm. A bundler `define` cannot do this, because that arm is guarded
// by `typeof process` (engine-worker.md §2.2).
//
// Imported first by `Engine.worker.js`, and only there: on the page,
// `window` already answers. Remove with the pin that carries conway#540.
if (typeof globalThis.window === 'undefined') {
  const existing = globalThis.process
  globalThis.process = {...existing, env: {...existing?.env, PLATFORM: 'web'}}
}
