// The engine worker runs Conway's SINGLE-THREADED wasm, always.
//
// Decided against the MT (pthreads) build for the engine worker
// (engine-worker.md §6): it needs cross-origin isolation, which breaks the
// sign-in popups (Share#1610, #2047). Prod is not isolated, so today
// conway's `pThreadsAllowed()` already answers false for want of a
// SharedArrayBuffer. This makes the choice explicit instead of an accident
// of the headers: if a page is ever isolated (a test server, a future
// header change), the engine still does not spawn a pthread pool inside
// every model's worker.
//
// Why a global and not only a bundler `define`: conway reads the switch as
// `typeof process !== 'undefined' && process?.env?.FORCE_SINGLE_THREAD`,
// and a `define` cannot supply `typeof process` (the same reason
// conway#540 needed its shim). tools/esbuild/build.js defines it for the
// worker bundle as well, for any reader without that guard.
//
// Permanent: unlike the conway#540 platform shim this sat beside until
// conway 1.1633.540 recognised a worker, it is not a workaround.
const existing = globalThis.process
globalThis.process = {
  ...existing,
  env: {...existing?.env, FORCE_SINGLE_THREAD: 'true'},
}
