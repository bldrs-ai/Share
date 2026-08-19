// N conway instances, one per worker, each pumping a disjoint shard of one
// model's geometry — M3 item 5 (conway#394).
//
// The main thread keeps its own instance for everything that is not
// geometry: the parse, properties, the spatial tree, and the coordination
// frame the workers are handed. The workers do only extraction, which is the
// part that is embarrassingly parallel across products and the part that
// dominates a large load (PSB: 40.5 s -> 7.4 s at N=4, measured in node on
// conway#536).
//
// Two engine preconditions make the partition safe, and both landed in
// conway#538:
//
//   - The dispatch key is residency-independent, so workers reading a
//     WINDOWED source (which is the only kind Share opens) agree on which
//     products each owns. Without that, a worker short of a page falls back
//     to a different key and a product is extracted twice or dropped.
//   - `SetCoordinationFrame` supplies one recentre frame to every worker, so
//     shards do not each derive their own anchor from whichever product they
//     happened to reach first.
//
// At N=1 nothing is sharded and the pool is a plain move-to-worker: same
// products, same order, one thread over.
import {isFeatureEnabled} from '../../FeatureFlags'
import debug, {WARN} from '../../utils/debug'
import {decodePlacements, makeWorkerGeometryApi} from './workerGeometryApi'


/* Products per pump call, per worker. Matches the main-thread async pump's
 * batch size: a windowed extract pages each product's #ref closure from
 * OPFS, and a larger batch serialises that I/O behind first pixels. */
const WORKER_BATCH_SIZE = 8

/* Workers when the flag is on but names no count. Two below the reported
 * core count, floored at 1: one core is the main thread's own render and
 * scene-merge work, and a second absorbs the ~1.3 cores each extraction
 * driver actually burns (main thread plus V8 GC/JIT), measured on
 * conway#394. */
const RESERVED_CORES = 2

/* Above this the duplicated shared-asset work outgrows the parallelism on
 * every model measured — the affinity key eliminates duplication entirely on
 * MB-Khaya but leaves +38 % on assembly-heavy D3D, and that fraction grows
 * with the shard count. */
const MAX_WORKERS = 8


/**
 * How many geometry workers this session should use, or 0 for none.
 *
 * `?feature=workers` turns the pool on at the machine's own width;
 * `?feature=workers2` (…3, …4) pins a count, which is what a smoke run needs
 * to compare N against N=1 on one machine.
 *
 * @return {number} worker count, 0 when the pool is off
 */
export function geometryWorkerCount() {
  for (let count = 1; count <= MAX_WORKERS; ++count) {
    if (isFeatureEnabled(`workers${count}`)) {
      return count
    }
  }
  if (!isFeatureEnabled('workers')) {
    return 0
  }
  const cores = globalThis.navigator?.hardwareConcurrency ?? RESERVED_CORES + 1
  return Math.max(1, Math.min(MAX_WORKERS, cores - RESERVED_CORES))
}


/* Memoized module-worker support. The probe builds and tears down a real
 * Worker, so running it per spawn would double the worker count a pool
 * creates — for an answer that cannot change within a session. */
let moduleWorkersSupported

/**
 * Whether this browser accepts `{type: 'module'}` workers.
 *
 * Mirrors `GlbWriterService`'s detection — old iOS and some Samsung Internet
 * builds reject it, and the build emits a classic IIFE bundle beside the ESM
 * one for them.
 *
 * @return {boolean} true when module workers load
 */
function supportsModuleWorkers() {
  if (moduleWorkersSupported !== undefined) {
    return moduleWorkersSupported
  }
  try {
    const url = URL.createObjectURL(new Blob([''], {type: 'application/javascript'}))
    new Worker(url, {type: 'module'}).terminate()
    URL.revokeObjectURL(url)
    moduleWorkersSupported = true
  } catch {
    moduleWorkersSupported = false
  }
  return moduleWorkersSupported
}


/**
 * Spawn one geometry worker.
 *
 * @return {Worker} the worker
 */
function spawnWorker() {
  const asModule = supportsModuleWorkers()
  const workerUrl = new URL(
    asModule ?
      './ConwayGeometry.worker.js' : './ConwayGeometry.worker.classic.js',
    import.meta.url)
  return new Worker(workerUrl, asModule ? {type: 'module'} : {})
}


/**
 * Run a model's geometry extraction across `count` workers and deliver the
 * merged deltas.
 *
 * Resolves when every shard has finished. Rejects if any shard fails: a
 * partial model is worse than a fallback to the main-thread pump, because
 * nothing downstream can tell which products are missing.
 *
 * @param {object} args
 * @param {Blob} args.file the OPFS-backed source File — posted to every
 *   worker, which each read it through `slice()` (non-exclusive, unlike an
 *   OPFS sync access handle)
 * @param {object} args.settings the deferred open settings
 * @param {number} args.count how many workers
 * @param {?Array<number>} args.coordination the shared recentre frame
 * @param {string} args.wasmPath where the workers load conway's wasm from
 * @param {Function} args.onBatch `(flatMeshes, api)` per merged delta
 * @param {Function} [args.onProgress] `(completed, total)` in PRODUCTS,
 *   summed across shards, as each batch lands
 * @return {Promise<object>} `{placements, geometries, workers, wasmHeapMb,
 *   jsHeapMb}`
 */
export function runGeometryWorkerPool({
  file, settings, count, coordination, wasmPath, onBatch, onProgress,
}) {
  return new Promise((resolve, reject) => {
    const store = makeWorkerGeometryApi()
    const workers = []
    let live = count
    let settled = false
    let placements = 0
    let wasmHeapMb = 0
    let jsHeapMb = 0

    /* Per-shard product counts, so the load report's Geometry line keeps
     * ticking and keeps meaning PRODUCTS. Each worker's `remaining` is its
     * own shard's, so the sums are the model's — and the total firms up as
     * shards report rather than being known at the first batch. Ticking at
     * all matters beyond the progress bar: the reporter's stall watchdog
     * fires after 30s of silence, and a pooled geometry phase that reported
     * only on completion would trip it on a big model. */
    const shardProgress = new Map()

    /**
     * Push the summed product counts to the caller.
     *
     * @param {number} index the reporting shard
     * @param {number} extracted products this batch finished
     * @param {number} remaining products left in that shard
     */
    const reportProgress = (index, extracted, remaining) => {
      if (typeof onProgress !== 'function') {
        return
      }
      const shard = shardProgress.get(index) ?? {done: 0, total: 0}
      shard.done += extracted
      shard.total = shard.done + remaining
      shardProgress.set(index, shard)

      let done = 0
      let total = 0
      for (const each of shardProgress.values()) {
        done += each.done
        total += each.total
      }
      onProgress(done, total)
    }

    // Deterministic origin-recenter (see below): batches queue until shard 0
    // has spoken, so the builder always takes its model-wide offset from the
    // same placement whatever order the shards finish in.
    let offsetDecided = count < 2
    const queued = []

    /**
     * Stop every worker. Safe to call twice.
     */
    const shutdown = () => {
      for (const worker of workers) {
        worker.terminate()
      }
      workers.length = 0
    }

    /**
     * @param {Error} error the first failure
     */
    const fail = (error) => {
      if (settled) {
        return
      }
      settled = true
      shutdown()
      reject(error)
    }

    /**
     * @param {object} message a `batch` payload
     */
    const deliver = (message) => {
      for (const geometry of message.geometries) {
        store.put(geometry)
      }
      placements += message.placements.parents.length
      onBatch(decodePlacements(message.placements), store.api)
      reportProgress(message.shardIndex, message.extracted, message.remaining)
    }

    /**
     * Release everything shard 0 was gating, lowest shard first.
     *
     * The order matters only in the case shard 0 produced nothing at all:
     * arrival order across shards is a race, so draining it as it stands
     * would put the offset decision back where this gate took it from.
     */
    const flushQueued = () => {
      offsetDecided = true
      queued.sort((a, b) => a.shardIndex - b.shardIndex)
      while (queued.length > 0) {
        deliver(queued.shift())
      }
    }

    /**
     * Handle one worker message. Defined once and shared by every worker —
     * the shard it concerns is on the message, so nothing here needs to
     * close over the spawn loop.
     *
     * @param {MessageEvent} event the worker's message
     */
    const onMessage = (event) => {
      const message = event.data
      if (settled || !message) {
        return
      }
      switch (message.type) {
        case 'batch':
          // The builder fixes the model-wide origin-recenter offset from
          // the FIRST placement it is handed, rounded to whole metres
          // (coordinationOffsetFor). Across N workers "first" would be
          // whichever shard's message won the race, so a georeferenced
          // model would land on a different offset run to run and every
          // saved camera against it would be wrong by the difference.
          // Gating on shard 0 makes it a property of the model again.
          if (offsetDecided) {
            deliver(message)
          } else if (message.shardIndex === 0) {
            // Shard 0's batch goes FIRST and decides the offset; only then
            // is the queue released. Flushing before delivering it would
            // hand the builder another shard's placement to decide from,
            // which is the exact race this gate exists to remove.
            deliver(message)
            flushQueued()
          } else {
            queued.push(message)
          }
          break
        case 'done':
          wasmHeapMb += message.wasmHeapMb ?? 0
          jsHeapMb += message.jsHeapMb ?? 0
          // Shard 0 finishing without ever emitting a batch still settles
          // the offset — otherwise a model whose shard 0 owns no geometry
          // would queue every other shard forever.
          if (message.shardIndex === 0 && !offsetDecided) {
            flushQueued()
          }
          if (--live === 0 && !settled) {
            settled = true
            // Queued work can only remain if shard 0 never reported at
            // all, which `done` above rules out; drained defensively so a
            // future message-ordering change cannot silently drop meshes.
            flushQueued()
            shutdown()
            resolve({
              placements,
              geometries: store.size,
              workers: count,
              wasmHeapMb,
              jsHeapMb,
            })
          }
          break
        case 'error':
          fail(new Error(`geometry worker ${message.shard}: ${message.message}`))
          break
        default:
          break
      }
    }

    /**
     * @param {number} index which worker died
     * @return {Function} its error handler
     */
    const makeErrorHandler = (index) => (event) =>
      fail(new Error(event.message || `geometry worker ${index} failed`))

    for (let index = 0; index < count; ++index) {
      const worker = spawnWorker()
      workers.push(worker)
      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', makeErrorHandler(index))
      worker.postMessage({
        type: 'load',
        file,
        settings,
        shard: {index, count},
        coordination,
        wasmPath,
        batchSize: WORKER_BATCH_SIZE,
      })
    }

    if (count === 0) {
      settled = true
      resolve({
        placements: 0, geometries: 0, workers: 0, wasmHeapMb: 0, jsHeapMb: 0,
      })
    }
  }).catch((error) => {
    debug(WARN).warn('geometry worker pool failed:', error)
    throw error
  })
}
