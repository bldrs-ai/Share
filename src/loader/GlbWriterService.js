// Service wrapper around `GlbWriter.worker.js` — lazy-inits the
// worker, routes request/reply pairs via a correlation id so multiple
// in-flight writes don't tangle.
//
// One worker per page (module-scope singleton). The writer is
// invoked at most one-or-two times per model load (cache miss after
// IFC parse); allocating a worker is cheap, but reusing avoids the
// ~50ms cold-start on a second load.
//
// Modelled on `src/OPFS/OPFSService.js` — same pattern of detecting
// module-worker support, falling back to a classic IIFE bundle for
// older browsers. The bundle pair is produced by `tools/esbuild/
// build.js` (both `GlbWriter.worker.js` and `GlbWriter.worker.classic.js`).


let workerRef = null
let nextRequestId = 1
const pending = new Map()


/**
 * @return {Worker} the singleton GlbWriter worker
 */
function getWorker() {
  if (workerRef !== null) {
    return workerRef
  }
  let supportsModuleWorkers
  try {
    const u = URL.createObjectURL(new Blob([''], {type: 'application/javascript'}))
    new Worker(u, {type: 'module'}).terminate()
    URL.revokeObjectURL(u)
    supportsModuleWorkers = true
  } catch {
    supportsModuleWorkers = false
  }

  const workerUrl = new URL(
    supportsModuleWorkers ? './GlbWriter.worker.js' : './GlbWriter.worker.classic.js',
    import.meta.url,
  )
  const opts = supportsModuleWorkers ? {type: 'module'} : {}
  workerRef = new Worker(workerUrl, opts)
  workerRef.addEventListener('message', (event) => {
    const reply = event.data
    if (!reply || typeof reply.id !== 'number') {
      return
    }
    const slot = pending.get(reply.id)
    if (!slot) {
      // Reply for an unknown id — could happen if a request rejected
      // synchronously before its id landed in the map (shouldn't,
      // since we add to map before postMessage, but be defensive).
      return
    }
    pending.delete(reply.id)
    if (reply.ok) {
      slot.resolve({bytes: reply.bytes, extStats: reply.extStats})
    } else {
      slot.reject(new Error(reply.error || 'GlbWriter worker reported failure'))
    }
  })
  workerRef.addEventListener('error', (event) => {
    // Hard worker failure — reject every in-flight request so callers
    // don't hang. Subsequent calls will rebuild the worker via the
    // null-check above (we null the ref before rejecting so the next
    // getWorker() call rebuilds).
    const err = new Error(event.message || 'GlbWriter worker error')
    const inflight = Array.from(pending.values())
    pending.clear()
    workerRef = null
    for (const slot of inflight) {
      slot.reject(err)
    }
  })
  return workerRef
}


/**
 * Dispatch the inject-and-pack step to the worker. Returns a Promise
 * resolving to the final container bytes + extension stats.
 *
 * @param {object} args
 * @param {Uint8Array} args.bytes GLB bytes, transferred zero-copy via
 *   the underlying ArrayBuffer
 * @param {string|null} args.mode container mode tag — draco/meshopt/null
 * @param {Array<object>} args.extensions extension payloads to inject;
 *   each entry is `{name, data, compress?, precompressed?}` matching
 *   `injectGlbExtensions`. A `precompressed` Uint8Array rides through
 *   the structured clone intact (deliberately NOT in the transfer
 *   list — the caller's inline fallback after a worker failure must
 *   still see an attached buffer)
 * @param {object} [args.sceneExtras] optional small string-keyed
 *   metadata merged into `scenes[0].extras` in the same inject pass
 *   (see `injectGlbExtensions`)
 * @return {Promise<{bytes: Uint8Array, extStats: object}>}
 */
export function injectAndPackInWorker({bytes, mode, extensions, sceneExtras}) {
  return new Promise((resolve, reject) => {
    const worker = getWorker()
    const id = nextRequestId
    nextRequestId += 1
    pending.set(id, {resolve, reject})
    try {
      worker.postMessage(
        {
          command: 'inject-and-pack',
          id,
          bytes,
          mode,
          extensions,
          sceneExtras: sceneExtras ?? null,
        },
        [bytes.buffer],
      )
    } catch (e) {
      pending.delete(id)
      reject(e)
    }
  })
}


/**
 * Terminate the worker if started. Used by tests + by viewer
 * disposal to release the worker thread when the page is shutting
 * down. Subsequent dispatches will rebuild the worker lazily.
 */
export function terminateGlbWriterWorker() {
  if (workerRef !== null) {
    workerRef.terminate()
    workerRef = null
  }
  // Any pending requests are abandoned; their promises stay
  // unresolved. Callers shouldn't be in this state at teardown.
  pending.clear()
}
