/* eslint-disable no-magic-numbers */
import {createHash} from 'node:crypto'
import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'
import {deleteBatchedInstance} from '../viewer/ifc/batchedEdit'
import {liveBatchedModel, triangleGeometry} from './glbArtifact.fixture'
import {buildInstancedGlbFromSnapshot} from './glbBatchedBuild'
import {exportBatchedModelAsInstancedGlb, exportBatchedModelOffThread} from './glbBatchedExport'
import {snapshotBatchedModel} from './glbBatchedSnapshot'
import {setGlbLogSink} from './glbLog'


// The batched-native cache writer split into a main-thread snapshot and a
// worker-side build (open-205 #2030 target 1). Three claims:
//
// 1. The split writer's bytes are the pre-split writer's bytes. The digests
//    below were taken from `exportBatchedModelAsInstancedGlb` at b8e02fb,
//    before the split, on the same fixtures, collapse on and off.
// 2. The bytes do not depend on which thread built them: a snapshot that
//    crossed a structured clone (what `postMessage` does) and was built by
//    the worker's own handler gives the in-process bytes.
// 3. The cache writer actually takes the worker path, and an edit that lands
//    while the snapshot is yielded abandons it rather than caching a mix.


/**
 * A two-triangle quad, a second shape topology beside `triangleGeometry`.
 *
 * @param {number} size side length
 * @return {BufferGeometry}
 */
function quadGeometry(size) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0, size, 0, 0, size, size, 0, 0, size, 0]), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 0, 2, 3]), 1))
  return geometry
}


/**
 * @param {Array<number>} t translation
 * @param {object} [opts]
 * @param {number} [opts.rotateZ]
 * @param {Array<number>} [opts.scale]
 * @return {Matrix4}
 */
function place(t, {rotateZ = 0, scale = [1, 1, 1]} = {}) {
  return new Matrix4().compose(
    new Vector3(...t),
    new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rotateZ),
    new Vector3(...scale))
}


/**
 * A two-batch model (opaque + transparent, as `assembleBatchedModel` splits
 * them) exercising every grouping rule the writer has: one source shape used
 * in BOTH batches (the cross-batch `src#` key), two source ids carrying the
 * same bytes (content interning, #1859), instanced and single-placement
 * groups (the collapse's two kinds), rotated, scaled and mirrored
 * placements, a transparent color, and STEP-style occurrence paths.
 *
 * @return {Group}
 */
function richBatchedModel() {
  const grey = {x: 0.8, y: 0.8, z: 0.8, w: 1}
  const red = {x: 0.9, y: 0.1, z: 0.1, w: 1}
  const glass = {x: 0.2, y: 0.5, z: 0.9, w: 0.4}

  const opaque = new BatchedMesh(8, 64, 64)
  const tri1 = opaque.addGeometry(triangleGeometry(1))
  const tri2 = opaque.addGeometry(triangleGeometry(2))
  const quad = opaque.addGeometry(quadGeometry(1.5))
  // Same bytes as tri1 under its own source id: interned into tri1's group.
  const tri1Twin = opaque.addGeometry(triangleGeometry(1))
  const tri3 = opaque.addGeometry(triangleGeometry(3))
  const opaqueLayout = [
    [tri1, place([1, 0, 0]), grey, 500, [1, 2]],
    [tri1, place([2, 0, 0], {rotateZ: Math.PI / 3}), grey, 500, [1, 3]],
    [tri1Twin, place([3, 0, 0]), grey, 501, [1, 4]],
    [tri2, place([0, 4, 0], {scale: [2, 2, 2]}), red, 600, [2]],
    [quad, place([5, 5, 0], {scale: [-1, 1, 1]}), grey, 700, [3]],
    [quad, place([6, 5, 0]), red, 700, [4]],
    [tri3, place([0, 0, 7], {rotateZ: Math.PI / 2}), grey, 800, [5]],
    [tri2, place([9, 0, 0]), grey, 600, [6]],
  ]
  for (const [geometryId, matrix] of opaqueLayout) {
    opaque.setMatrixAt(opaque.addInstance(geometryId), matrix)
  }
  opaque.instanceParents = opaqueLayout.map((_, i) => 100 + i)
  opaque.instanceOccurrenceIds = opaqueLayout.map((_, i) => i)
  opaque.instanceGeometryIds = opaqueLayout.map((row) => row[3])
  opaque.instanceOccurrencePaths = opaqueLayout.map((row) => row[4])
  opaque.instanceSourceColors = opaqueLayout.map((row) => ({...row[2]}))

  const transparent = new BatchedMesh(3, 16, 16)
  // Source id 500 again: the same shape as the opaque batch's tri1, which the
  // writer must dedupe across the two batches.
  const glassTri = transparent.addGeometry(triangleGeometry(1))
  const glassQuad = transparent.addGeometry(quadGeometry(0.5))
  const transparentLayout = [
    [glassTri, place([1, 1, 1]), glass, 500, [7]],
    [glassQuad, place([2, 2, 2]), glass, 900, [8]],
    [glassQuad, place([3, 3, 3], {rotateZ: Math.PI}), glass, 900, [9]],
  ]
  for (const [geometryId, matrix] of transparentLayout) {
    transparent.setMatrixAt(transparent.addInstance(geometryId), matrix)
  }
  transparent.instanceParents = transparentLayout.map((_, i) => 200 + i)
  transparent.instanceOccurrenceIds = transparentLayout.map((_, i) => opaqueLayout.length + i)
  transparent.instanceGeometryIds = transparentLayout.map((row) => row[3])
  transparent.instanceOccurrencePaths = transparentLayout.map((row) => row[4])
  transparent.instanceSourceColors = transparentLayout.map((row) => ({...row[2]}))

  const group = new Group()
  group.add(opaque, transparent)
  return group
}


/**
 * SHA-256 of the bytes and of the tables, the two things the writer hands on.
 *
 * @param {{bytes: Uint8Array, tableNodes: Array<object>}} written
 * @return {{bytes: string, tables: string}}
 */
function digestOf(written) {
  return {
    bytes: createHash('sha256').update(written.bytes).digest('hex'),
    tables: createHash('sha256').update(JSON.stringify(written.tableNodes)).digest('hex'),
  }
}


const FIXTURES = {
  live: liveBatchedModel,
  rich: richBatchedModel,
}

// Taken from the pre-split writer (b8e02fb) on these fixtures.
const PRE_SPLIT_DIGESTS = {
  'live collapse=false': {
    bytes: '66e8f1d634f2255b4e2354a1f6f00472ca8e7db6f31d27f2657621c3c98e290d',
    tables: 'c2e551685aec2f8dc591247617fcf6b752d12f3e56bbe7730fd6a17a0589ecb2',
  },
  'live collapse=true': {
    bytes: '2a952c812f6109ee89411f3d2cc2b7f2b2f2da54c637e4584969aafa4de42b3e',
    tables: '9bd4d05fb3402e89c2c61f0843af508b4d9a208717c009563b9632c7448b13a2',
  },
  'rich collapse=false': {
    bytes: 'fa94fb79fa8a272a53df3463ec195cb056180a44fb6343016c96f9fce47a11ba',
    tables: '3af56bc7bc633c1d0a743d3e235f42e0a640032220312628ebc8c676275a0fff',
  },
  'rich collapse=true': {
    bytes: 'c23261b5cfbe210fa5dfb5d61e8fc4f92bdf7f120edc72cf2d7bdc24d7783eab',
    tables: '2a210fe98d63e191e76a8271bea1fef4c60445b9d21b9e4c861075a4e5bb036c',
  },
}


/**
 * Re-home a structured clone's typed arrays in this test realm. Node's
 * `structuredClone` builds them from the OUTER realm's constructors, which
 * the jsdom realm's `instanceof Float32Array` (the writer's writability
 * check) rejects; a worker's clone is built in the worker's own realm, so
 * this is a test-environment artifact, not something the writer meets.
 *
 * @param {*} value
 * @return {*}
 */
function intoThisRealm(value) {
  if (ArrayBuffer.isView(value)) {
    return new globalThis[value.constructor.name](value)
  }
  if (Array.isArray(value)) {
    return value.map(intoThisRealm)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, intoThisRealm(v)]))
  }
  return value
}


/**
 * Load the worker module against a fake `self`, returning a function that
 * posts one request to it and resolves with its reply.
 *
 * @return {Function} `(data) => Promise<reply>`
 */
function loadWorkerHandler() {
  // jsdom's `self` is the window, and not assignable: stand in for the
  // worker global by intercepting the two members the worker uses.
  let handler = null
  const replies = []
  const listen = jest.spyOn(self, 'addEventListener').mockImplementation((name, fn) => {
    if (name === 'message') {
      handler = fn
    }
  })
  jest.spyOn(self, 'postMessage').mockImplementation((data) => replies.push(data))
  jest.isolateModules(() => {
    require('./GlbWriter.worker')
  })
  listen.mockRestore()
  return async (data) => {
    replies.length = 0
    await handler({data})
    return replies[0]
  }
}


describe('loader/glbBatched off-thread writer (open-205 #2030)', () => {
  let logs
  beforeEach(() => {
    logs = []
    setGlbLogSink((level, args) => logs.push([level, args.join(' ')]))
  })
  afterEach(() => {
    setGlbLogSink(null)
    jest.restoreAllMocks()
  })

  for (const [name, make] of Object.entries(FIXTURES)) {
    for (const collapse of [false, true]) {
      const label = `${name} collapse=${collapse}`

      it(`writes the pre-split writer's bytes and tables (${label})`, async () => {
        const written = await exportBatchedModelAsInstancedGlb(make(), {collapse})
        expect(digestOf(written)).toEqual(PRE_SPLIT_DIGESTS[label])
      })

      it(`builds the same bytes in the worker from a cloned snapshot (${label})`, async () => {
        const inProcess = await exportBatchedModelAsInstancedGlb(make(), {collapse})
        // Sliced with a zero budget, so every clock check yields: the most
        // interleaved the writer can be, which must change nothing.
        const taken = await snapshotBatchedModel(make(), {
          budgetMs: 0,
          yieldFn: () => Promise.resolve(),
        })
        // What postMessage does to the request: a structured clone that
        // moves (detaches) the transferred buffers.
        const snapshot = intoThisRealm(
          structuredClone(taken.snapshot, {transfer: taken.transfer}))
        expect(taken.transfer.every((buffer) => buffer.byteLength === 0)).toBe(true)
        const post = loadWorkerHandler()
        const reply = await post({command: 'build-batched-glb', id: 7, snapshot, collapse})
        expect(reply.ok).toBe(true)
        expect(reply.id).toBe(7)
        expect(digestOf(reply.built)).toEqual(digestOf(inProcess))
        expect(reply.built.tableNodes).toEqual(inProcess.tableNodes)
        expect(reply.built.collapsed).toBe(collapse)
        // The diagnostics come back as lines for the main thread to replay.
        expect(reply.logs.some((line) => line.startsWith('batched writer: '))).toBe(true)
      })
    }
  }

  it('matches the old walk on every per-instance field it snapshots', async () => {
    const taken = await snapshotBatchedModel(richBatchedModel())
    const {instances, shapes} = taken.snapshot
    expect(instances.count).toBe(11)
    // Six source ids (500, 501, 600, 700, 800, 900), one shape each. The
    // transparent batch's source-id-500 instance reuses the OPAQUE batch's
    // shape — the cross-batch dedup — so there is no seventh.
    expect(shapes.count).toBe(6)
    expect(instances.shape[8]).toBe(instances.shape[0])
    expect(instances.parents).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 200, 201, 202])
    expect(instances.occurrencePaths[9]).toEqual([8])
    expect(Array.from(instances.colors.slice(32, 36))).toEqual([0.2, 0.5, 0.9, 0.4])
  })

  it('declines a model whose batch has no colors, as the old walk did', async () => {
    const mesh = liveBatchedModel()
    mesh.instanceSourceColors = null
    mesh.instanceColors = null
    expect(await snapshotBatchedModel(mesh)).toBeNull()
  })

  it('abandons the snapshot when the model is edited while it is yielded', async () => {
    const mesh = liveBatchedModel()
    let yields = 0
    const taken = await snapshotBatchedModel(mesh, {
      budgetMs: 0,
      yieldFn: () => {
        yields++
        if (yields === 1) {
          deleteBatchedInstance(mesh, 2)
        }
        return Promise.resolve()
      },
    })
    expect(taken).toEqual({edited: true})
  })

  for (const [label, opts] of [
    ['in-process', undefined],
    ['sliced, before any slice is due', {budgetMs: 1e9, yieldFn: () => Promise.resolve()}],
  ]) {
    it(`does not suspend where an edit could slip into the walk (${label})`, async () => {
      // An edit that runs at a microtask checkpoint — from some other
      // promise chain — must not land between two instances of one walk.
      // The walk only suspends at a due slice, and re-checks revisions there;
      // anywhere else it must not suspend at all, so this edit can only run
      // after the snapshot is complete (codex on #2035).
      const mesh = liveBatchedModel()
      Promise.resolve().then(() => deleteBatchedInstance(mesh, 2))
      const taken = await snapshotBatchedModel(mesh, opts)
      expect(taken.snapshot.instances.count).toBe(3)
    })
  }

  describe('exportBatchedModelOffThread', () => {
    let originalWorker
    let originalCreateObjectURL
    let posted
    let worker
    beforeEach(() => {
      jest.resetModules()
      originalWorker = global.Worker
      originalCreateObjectURL = global.URL.createObjectURL
      global.URL.createObjectURL = () => 'blob:fake'
      posted = []
      /** Stub Worker: records requests, replies on demand. */
      global.Worker = class {
        /** */
        constructor() {
          this.listeners = {message: [], error: []}
          worker = this
        }
        /**
         * @param {object} data
         * @param {Array} transfer
         */
        postMessage(data, transfer) {
          posted.push({data, transfer})
        }
        /**
         * @param {string} name
         * @param {Function} fn
         */
        addEventListener(name, fn) {
          this.listeners[name]?.push(fn)
        }
        /** Nothing to release. */
        terminate() {
          // Intentionally empty: the stub holds no thread.
        }
      }
    })
    afterEach(() => {
      global.Worker = originalWorker
      global.URL.createObjectURL = originalCreateObjectURL
    })

    /**
     * The snapshot is taken in yielding slices before anything is posted,
     * so wait for the request itself rather than for a fixed tick.
     *
     * @return {Promise<object>} the posted `build-batched-glb` request
     */
    async function buildRequest() {
      for (;;) {
        const request = posted.find((p) => p.data.command === 'build-batched-glb')
        if (request) {
          return request
        }
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    it('sends the snapshot to the worker with its buffers in the transfer list', async () => {
      // The worker's verbose lines are replayed through `glbVerbose`, which
      // only emits under its flag.
      window.history.pushState({}, '', '/?feature=glbVerbose')
      const {exportBatchedModelOffThread: offThread} = require('./glbBatchedExport')
      const pending = offThread(liveBatchedModel(), {collapse: true})
      const request = await buildRequest()
      expect(request.data.collapse).toBe(true)
      const {snapshot} = request.data
      for (const array of [snapshot.instances.matrices, snapshot.instances.shape,
        snapshot.shapes.vertexStart, snapshot.batches[0].position.array, snapshot.batches[0].index]) {
        expect(request.transfer).toContain(array.buffer)
      }
      const built = {bytes: new Uint8Array([1, 2, 3]), tableNodes: [], collapsed: true}
      for (const fn of worker.listeners.message) {
        fn({data: {command: 'build-batched-glb:done', id: request.data.id, ok: true, built,
          logs: ['batched writer: from the worker']}})
      }
      expect(await pending).toBe(built)
      expect(logs).toContainEqual(['info', 'batched writer: from the worker'])
      window.history.pushState({}, '', '/')
    })

    it('caches nothing when the worker declines a model that was edited meanwhile', async () => {
      // A decline sends the caller to the merged bake of the LIVE model, and
      // the build ran for seconds in the worker: an edit in that window must
      // not reach the source's cache slot (codex on #2035).
      const {exportBatchedModelOffThread: offThread} = require('./glbBatchedExport')
      const model = liveBatchedModel()
      const pending = offThread(model)
      const request = await buildRequest()
      deleteBatchedInstance(model, 2)
      for (const fn of worker.listeners.message) {
        fn({data: {command: 'build-batched-glb:done', id: request.data.id, ok: true, built: null,
          logs: []}})
      }
      expect(await pending).toEqual({edited: true})
    })

    it('passes a decline through when nothing was edited', async () => {
      const {exportBatchedModelOffThread: offThread} = require('./glbBatchedExport')
      const pending = offThread(liveBatchedModel())
      const request = await buildRequest()
      for (const fn of worker.listeners.message) {
        fn({data: {command: 'build-batched-glb:done', id: request.data.id, ok: true, built: null,
          logs: []}})
      }
      expect(await pending).toBeNull()
    })

    it('builds in-process, with the same bytes, when the worker fails', async () => {
      const {exportBatchedModelOffThread: offThread} = require('./glbBatchedExport')
      const pending = offThread(liveBatchedModel())
      await buildRequest()
      for (const fn of worker.listeners.error) {
        fn({message: 'boom'})
      }
      const result = await pending
      const inProcess = await exportBatchedModelAsInstancedGlb(liveBatchedModel())
      expect(digestOf(result)).toEqual(digestOf(inProcess))
    })
  })

  it('is exported for the cache writer', () => {
    expect(typeof exportBatchedModelOffThread).toBe('function')
    expect(typeof buildInstancedGlbFromSnapshot).toBe('function')
  })
})
