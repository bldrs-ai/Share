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
import './engineThreading'
import Logger, {DATA_DEFECT} from '@bldrs-ai/conway/src/logging/logger'
import {createEngineHandler} from './engineHandler'
import {makeLogForwarder} from './engineStream'
import {ENGINE_PROTOCOL_VERSION, Ev} from './protocol'


const handler = createEngineHandler({
  // The page's load report cannot see this worker's Logger (another module
  // instance) or its console, so both are forwarded (§2.4 G3).
  logForwarder: makeLogForwarder({logger: Logger, console: self.console, dataDefect: DATA_DEFECT}),
  // Conway's web-ifc compat surface, imported by its own subpath (Share has
  // no `web-ifc` package or alias since #2002 and ifclib 6.0.0); bundled
  // into this worker as its own copy.
  loadIfcAPI: () => import('@bldrs-ai/conway/web-ifc').then((m) => m.IfcAPI),
  post: (msg, transfer) => self.postMessage(msg, transfer ?? []),
})

self.addEventListener('message', (event) => {
  handler.handle(event.data)
})

// Announce the engine, and the protocol version it speaks, now that the
// module (and its copy of Conway) has evaluated. EngineSession#init starts
// its timeout from this, not from spawn (see ENGINE_INIT_TIMEOUT_MS).
self.postMessage({v: ENGINE_PROTOCOL_VERSION, epoch: 0, ev: Ev.HELLO, seq: 0})
