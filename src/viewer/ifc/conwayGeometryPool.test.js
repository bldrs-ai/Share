/* eslint-disable no-magic-numbers */
// The geometry worker pool's merge rules. Real Workers don't run in jsdom,
// so the workers are stubbed and their messages driven from the test — which
// is what makes the ORDERING properties testable at all: the whole point of
// the shard-0 gate is what happens when shards report out of order, and a
// real pool would only hit that by luck.

/* Every FakeWorker built, including the throwaway the module-worker probe
 * constructs. `pooled()` is the pool's real workers — the probe is torn down
 * without ever being posted to. */
let allWorkers = []


/**
 * @return {Array<FakeWorker>} the workers the pool actually drives
 */
function pooled() {
  return allWorkers.filter((each) => each.posted.length > 0)
}

/** Stub Worker — records posts, dispatches synthetic messages. */
class FakeWorker {
  /** */
  constructor() {
    this.posted = []
    this.listeners = {message: [], error: []}
    this.terminated = false
    allWorkers.push(this)
  }
  /** @param {object} data */
  postMessage(data) {
    this.posted.push(data)
  }
  /**
   * @param {string} name
   * @param {Function} fn
   */
  addEventListener(name, fn) {
    this.listeners[name]?.push(fn)
  }
  /** */
  terminate() {
    this.terminated = true
  }
  /** @param {object} data */
  fire(data) {
    for (const fn of this.listeners.message) {
      fn({data})
    }
  }
  /** @param {string} message */
  fireError(message) {
    for (const fn of this.listeners.error) {
      fn({message})
    }
  }
}


/**
 * A `batch` message carrying one placement, tagged so the test can tell
 * which shard's geometry reached the builder first.
 *
 * @param {number} shardIndex which shard
 * @param {number} count shards in the pool
 * @param {number} parent the parent express id
 * @param {number} [extracted] products this batch finished, for the shard
 * @param {number} [remaining] products left in that shard
 * @return {object} the message
 */
function batchMessage(shardIndex, count, parent, extracted = 1, remaining = 0) {
  return {
    type: 'batch',
    shard: `${shardIndex}/${count}`,
    shardIndex,
    placements: {
      parents: Uint32Array.from([parent]),
      geometryIds: Uint32Array.from([parent * 10]),
      transforms: new Float64Array(16),
      colors: Float32Array.from([1, 1, 1, 1]),
    },
    geometries: [{
      id: parent * 10,
      vertices: new Float32Array(6),
      indices: new Uint32Array([0, 1, 2]),
      vertCount: 1,
    }],
    extracted,
    remaining,
  }
}


/**
 * @param {number} shardIndex which shard
 * @param {number} count shards in the pool
 * @return {object} a `done` message
 */
function doneMessage(shardIndex, count) {
  return {type: 'done', shard: `${shardIndex}/${count}`, shardIndex}
}


describe('viewer/ifc/conwayGeometryPool', () => {
  let originalWorker
  let originalCreateObjectURL
  let originalRevokeObjectURL

  beforeEach(() => {
    originalWorker = global.Worker
    originalCreateObjectURL = global.URL.createObjectURL
    originalRevokeObjectURL = global.URL.revokeObjectURL
    global.Worker = FakeWorker
    global.URL.createObjectURL = () => 'blob:fake'
    global.URL.revokeObjectURL = () => {}
    allWorkers = []
    jest.resetModules()
  })

  afterEach(() => {
    global.Worker = originalWorker
    global.URL.createObjectURL = originalCreateObjectURL
    global.URL.revokeObjectURL = originalRevokeObjectURL
  })

  /**
   * @param {object} overrides pool arguments to override
   * @return {Promise<object>} `{promise, seen}`
   */
  async function startPool(overrides = {}) {
    const {runGeometryWorkerPool} = await import('./conwayGeometryPool')
    const seen = []
    const promise = runGeometryWorkerPool({
      file: {size: 10},
      settings: {DEFER_GEOMETRY: true},
      count: 3,
      coordination: null,
      wasmPath: './static/js/',
      onBatch: (flatMeshes) => seen.push(...flatMeshes.map((each) => each.expressID)),
      ...overrides,
    })
    return {promise, seen}
  }

  it('gives every worker its own shard of the same source', async () => {
    const {promise} = await startPool()

    expect(pooled().length).toBe(3)
    expect(pooled().map((each) => each.posted[0].shard))
      .toEqual([{index: 0, count: 3}, {index: 1, count: 3}, {index: 2, count: 3}])
    // One File, posted to all of them — each reads it with slice(), which is
    // non-exclusive, unlike an OPFS sync access handle.
    for (const worker of pooled()) {
      expect(worker.posted[0].file).toEqual({size: 10})
    }

    for (let index = 0; index < 3; ++index) {
      pooled()[index].fire(doneMessage(index, 3))
    }
    await promise
  })

  it('delivers shard 0 first however the shards race', async () => {
    // The builder fixes the model-wide origin-recenter offset from the FIRST
    // placement it is handed, rounded to whole metres. Without this gate a
    // georeferenced model would take that offset from whichever worker won
    // the race, so it would move between runs and every saved camera against
    // it would be wrong by the difference.
    const {promise, seen} = await startPool()

    pooled()[2].fire(batchMessage(2, 3, 30))
    pooled()[1].fire(batchMessage(1, 3, 20))
    expect(seen).toEqual([])

    pooled()[0].fire(batchMessage(0, 3, 10))
    expect(seen[0]).toBe(10)
    // ...and the queue drains lowest-shard-first behind it.
    expect(seen).toEqual([10, 20, 30])

    // Once decided, later batches flow straight through.
    pooled()[2].fire(batchMessage(2, 3, 31))
    expect(seen).toEqual([10, 20, 30, 31])

    for (let index = 0; index < 3; ++index) {
      pooled()[index].fire(doneMessage(index, 3))
    }
    await promise
  })

  it('releases the queue in shard order when shard 0 owns nothing', async () => {
    // A shard can legitimately end up with no products. Draining in arrival
    // order here would put the offset decision back on a race, so the queue
    // is sorted before it is released.
    const {promise, seen} = await startPool()

    pooled()[2].fire(batchMessage(2, 3, 30))
    pooled()[1].fire(batchMessage(1, 3, 20))
    expect(seen).toEqual([])

    pooled()[0].fire(doneMessage(0, 3))
    expect(seen).toEqual([20, 30])

    pooled()[1].fire(doneMessage(1, 3))
    pooled()[2].fire(doneMessage(2, 3))
    await promise
  })

  it('reports progress in products, summed across shards, as batches land',
    async () => {
      // The load report's Geometry line counts PRODUCTS, and each worker's
      // `remaining` is its own shard's — so the sums are the model's, and
      // the total firms up as shards check in rather than being known at
      // the first batch.
      //
      // Reporting per batch rather than once at the end is also what keeps
      // the reporter's 30s stall watchdog fed: an earlier version reported
      // only on completion and the Geometry line came out as
      // `0.007s, +0.000000 MB heap` on a real model.
      const progress = []
      const {promise} = await startPool({
        onProgress: (completed, total) => progress.push([completed, total]),
      })

      pooled()[0].fire(batchMessage(0, 3, 10, 2, 4))
      expect(progress[progress.length - 1]).toEqual([2, 6])

      pooled()[1].fire(batchMessage(1, 3, 20, 3, 1))
      expect(progress[progress.length - 1]).toEqual([5, 10])

      pooled()[0].fire(batchMessage(0, 3, 11, 4, 0))
      expect(progress[progress.length - 1]).toEqual([9, 10])

      for (let index = 0; index < 3; ++index) {
        pooled()[index].fire(doneMessage(index, 3))
      }
      await promise
    })

  it('sums the wasm heap each worker reports', async () => {
    // Without this the load report is actively flattering under a pool: its
    // heap figures come from the MAIN thread, and extraction moving into
    // workers moves the allocations somewhere that sample cannot see.
    const {promise} = await startPool()

    pooled()[0].fire({...doneMessage(0, 3), wasmHeapMb: 100, jsHeapMb: 10})
    pooled()[1].fire({...doneMessage(1, 3), wasmHeapMb: 50, jsHeapMb: 5})
    pooled()[2].fire(doneMessage(2, 3))

    const result = await promise
    expect(result.wasmHeapMb).toBe(150)
    expect(result.jsHeapMb).toBe(15)
  })

  it('reports placements and distinct geometries once every shard is done', async () => {
    const {promise} = await startPool()

    pooled()[0].fire(batchMessage(0, 3, 10))
    pooled()[1].fire(batchMessage(1, 3, 20))
    // Same geometry id from two shards — placement makes that rare, not
    // impossible, and it must count once.
    pooled()[2].fire(batchMessage(2, 3, 10))

    for (let index = 0; index < 3; ++index) {
      pooled()[index].fire(doneMessage(index, 3))
    }

    const result = await promise
    expect(result).toEqual({
      placements: 3, geometries: 2, workers: 3, wasmHeapMb: 0, jsHeapMb: 0,
    })
    expect(pooled().every((each) => each.terminated)).toBe(true)
  })

  it('rejects and terminates the pool when one shard fails', async () => {
    // A partial model is worse than a fallback: nothing downstream can tell
    // which products are missing, so the caller has to be told to re-pump.
    const {promise} = await startPool()

    pooled()[0].fire(batchMessage(0, 3, 10))
    pooled()[1].fire({
      type: 'error', shard: '1/3', shardIndex: 1, message: 'wasm init failed',
    })

    await expect(promise).rejects.toThrow(/wasm init failed/)
    expect(pooled().every((each) => each.terminated)).toBe(true)
  })

  it('rejects when a worker dies outright', async () => {
    const {promise} = await startPool()
    pooled()[1].fireError('worker boom')
    await expect(promise).rejects.toThrow(/worker boom/)
  })
})


describe('geometryWorkerCount', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  /**
   * @param {Array<string>} enabled flags that report as on
   * @return {Promise<Function>} the count function under that flag set
   */
  async function withFlags(enabled) {
    jest.doMock('../../FeatureFlags', () => ({
      isFeatureEnabled: (name) => enabled.includes(name),
    }))
    const {geometryWorkerCount} = await import('./conwayGeometryPool')
    return geometryWorkerCount
  }

  it('is off unless a flag asks for it', async () => {
    const count = await withFlags([])
    expect(count()).toBe(0)
  })

  it('honours a pinned count, which is how N is compared against N=1', async () => {
    const count = await withFlags(['workers', 'workers2'])
    expect(count()).toBe(2)
  })

  it('pins N=1 even though the bare flag would size from the machine', async () => {
    // N=1 is the move-to-worker baseline: same products, same order, one
    // thread over. It has to be reachable independently of core count.
    const count = await withFlags(['workers1'])
    expect(count()).toBe(1)
  })

  it('leaves the main thread cores when sizing itself', async () => {
    const original = globalThis.navigator?.hardwareConcurrency
    Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', {
      value: 8, configurable: true,
    })
    const count = await withFlags(['workers'])
    expect(count()).toBe(6)
    Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', {
      value: original, configurable: true,
    })
  })
})
