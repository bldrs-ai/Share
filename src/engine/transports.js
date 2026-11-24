// The two ways an EngineSession reaches its engine (design/new/engine-worker.md
// §4, §8 item 6). Both present the same four-method shape, so EngineSession
// never branches on which one it holds:
//
//   post(msg, transfer?)   send one request
//   onMessage(cb)          every reply and event, in order
//   onCrash(cb)            the engine died without replying (worker
//                          `error` / `messageerror`); never fires in process
//   terminate()            free the engine
//
// `terminate()` is the point of the worker transport: it returns the whole
// engine — wasm heap, parse buffers, resident windows — to the browser at
// once (§3). The in-process transport can only drop references and let GC
// decide, which is why it is the fallback and not the default.


/**
 * A transport over a dedicated `Worker` running `Engine.worker.js`.
 *
 * @param {Worker} worker
 * @return {object} transport
 */
export function makeWorkerTransport(worker) {
  const listeners = []
  const crashListeners = []
  let terminated = false
  worker.addEventListener('message', (event) => {
    for (const cb of listeners) {
      cb(event.data)
    }
  })
  const crash = (event) => {
    const message = event?.message || (event?.type === 'messageerror' ?
      'engine worker sent a message that could not be deserialized' :
      'engine worker failed')
    for (const cb of crashListeners) {
      cb(new Error(message))
    }
  }
  worker.addEventListener('error', crash)
  worker.addEventListener('messageerror', crash)
  return {
    kind: 'worker',
    post(msg, transfer = []) {
      if (!terminated) {
        worker.postMessage(msg, transfer)
      }
    },
    onMessage(cb) {
      listeners.push(cb)
    },
    onCrash(cb) {
      crashListeners.push(cb)
    },
    terminate() {
      terminated = true
      worker.terminate()
    },
  }
}


/**
 * A transport that runs the engine handler on this thread: the main-thread
 * fallback (§8 item 6), and what Jest drives.
 *
 * Messages are structured-cloned in both directions where the runtime can,
 * so a payload that would fail to cross a real worker boundary (a function,
 * a native view) fails here too instead of only in production. Delivery is
 * asynchronous in both directions, as it is across a worker, so no caller
 * comes to depend on a reply arriving synchronously.
 *
 * @param {function(function(object, Array=): void): {handle: Function, dispose: Function}} createHandler
 *   builds the handler, given the function it posts with
 * @return {object} transport
 */
export function makeInProcessTransport(createHandler) {
  const listeners = []
  let terminated = false
  const deliver = (msg, transfer) => {
    if (terminated) {
      return
    }
    const copy = cloneForTransport(msg, transfer)
    queueMicrotask(() => {
      if (!terminated) {
        for (const cb of listeners) {
          cb(copy)
        }
      }
    })
  }
  const handler = createHandler(deliver)
  return {
    kind: 'inProcess',
    post(msg, transfer = []) {
      if (terminated) {
        return
      }
      const copy = cloneForTransport(msg, transfer)
      queueMicrotask(() => {
        if (!terminated) {
          handler.handle(copy)
        }
      })
    },
    onMessage(cb) {
      listeners.push(cb)
    },
    onCrash() {
      // A throw in process lands in the handler's own try/catch and comes
      // back as an `ok: false` reply; there is no separate death to report.
    },
    terminate() {
      terminated = true
      handler.dispose()
    },
  }
}


/**
 * Structured-clone a message the way `postMessage` would, transferring the
 * listed buffers. Falls back to the message itself where `structuredClone`
 * is missing (old jsdom); the worker path is then the only check.
 *
 * @param {object} msg
 * @param {Array} [transfer]
 * @return {object}
 */
function cloneForTransport(msg, transfer) {
  if (typeof structuredClone !== 'function') {
    return msg
  }
  return structuredClone(msg, transfer && transfer.length > 0 ? {transfer} : undefined)
}
