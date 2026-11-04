// One model's Conway engine, off the main thread (design/new/engine-worker.md).
//
// The page spawns one of these per model session (`spawnEngine.js`) and
// talks to it through `EngineSession`. Evicting the model is
// `worker.terminate()`, which returns the whole engine to the browser (§3).
//
// Module worker only. The engine's fallback for browsers without module
// workers is the in-process transport, not a classic-IIFE bundle as the OPFS
// and GLB writer workers have: that keeps one engine build per page (§8
// item 6).
import './workerPlatform'
import {createEngineHandler} from './engineHandler'


const handler = createEngineHandler({
  // `web-ifc` is Conway's compat surface (tools/esbuild/plugins.js
  // `webIfcShimAlias`); bundled into this worker as its own copy.
  loadIfcAPI: () => import('web-ifc').then((m) => m.IfcAPI),
  post: (msg, transfer) => self.postMessage(msg, transfer ?? []),
})

self.addEventListener('message', (event) => {
  handler.handle(event.data)
})
