/* eslint-disable no-magic-numbers */
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  Frustum,
  Group,
  Matrix4,
  OrthographicCamera,
} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
// Mocked below (jest hoists the mock above this import).
import {captureException} from '@sentry/react'
import {batchedArtifactBytes} from '../../loader/glbArtifact.fixture'
import {BldrsInstanceTablesReader} from '../../loader/bldrsInstanceTables'
import {robustBoundsFor} from '../three/robustBounds'
import {ResidencyController} from '../residency/ResidencyController'
import {
  BatchEditIdError,
  BatchEditReentryError,
  BatchEditKind,
  addBatchedGeometry,
  addBatchedInstance,
  batchEditListenerCount,
  batchEditRevision,
  deleteBatchedInstance,
  mintGeometryId,
  mintOccurrenceId,
  modelHasPostLoadEdits,
  onBatchEdit,
  setBatchedInstanceGeometry,
  setBatchedInstanceMatrix,
} from './batchedEdit'
import {applyBatchedInstanceSelection, applyBatchedSelection} from './batchedHighlight'
import {instanceGeometryAt, makeInstanceGeometryReader} from './batchedInstanceGeometry'
import {forEachActiveInstance} from './batchedInstanceTables'
import {RED, SHAPE_ID, SPACING, decoratedStepBatch, unitTriangleApi} from './batchedModel.fixture'
import {buildBatchedSubsetMesh} from './batchedSubset'
import {batchedModelOccurrenceTables} from './batchedToMergedMesh'
import {decorateBatchMeshes} from './buildBatchedConwayModel'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'
import {hydrateBatchedModelFromInstancedGlb} from './instancedGlbToBatchedModel'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


const PURPLE = {x: 0.5, y: 0, z: 0.5, w: 1}

// Instantiating GLTFLoader's parse on a loaded CI worker can outrun jest's
// default 5s.
const TIMEOUT_MS = 60000


/**
 * @param {number} size leg length
 * @return {BufferGeometry} a right triangle at the origin, the fixture's
 *   attribute set
 */
function triangle(size) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0, size, 0, 0, 0, size, 0,
  ]), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
  return geometry
}


/**
 * @param {object} geometry BufferGeometry
 * @return {Array<number>}
 */
function positions(geometry) {
  return Array.from(geometry.getAttribute('position').array)
}


/**
 * Paste the fixture's source shape as product `parent` at x.
 *
 * @param {object} mesh decorated fixture batch
 * @param {number} parent
 * @param {number} x
 * @param {number} [occurrenceId] defaults to a fresh one from the mint
 * @return {number} batch id
 */
function paste(mesh, parent, x, occurrenceId = mintOccurrenceId(mesh)) {
  return addBatchedInstance(mesh, mesh.getGeometryIdAt(0), {
    parent, occurrenceId, geometryId: SHAPE_ID, color: PURPLE,
  }, new Matrix4().makeTranslation(x, 0, 0))
}


/**
 * @param {Uint8Array} bytes a batched artifact
 * @return {Promise<object>} the hydrated batch
 */
async function hydrate(bytes) {
  const loader = new GLTFLoader()
  loader.register((parser) => new BldrsInstanceTablesReader(parser))
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const gltf = await new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject))
  return hydrateBatchedModelFromInstancedGlb(gltf.scene)
}


describe('viewer/ifc/batchedEdit', () => {
  describe('identity columns (round 4 finding 1)', () => {
    for (const missing of ['parent', 'occurrenceId', 'geometryId']) {
      it(`refuses an added instance with no ${missing}, and changes nothing`, () => {
        const mesh = decoratedStepBatch()
        const row = {parent: 400, occurrenceId: 9, geometryId: SHAPE_ID, color: PURPLE}
        delete row[missing]

        expect(() => addBatchedInstance(mesh, mesh.getGeometryIdAt(0), row, new Matrix4()))
          .toThrow(BatchEditIdError)
        expect(mesh.instanceCount).toBe(4)
        expect(batchEditRevision(mesh)).toBe(0)
      })
    }

    it('keeps occurrence 0\'s path when a paste takes a minted occurrence id', () => {
      // A defaulted occurrence id of 0 overwrote this path in the cache-hit
      // occurrence tables (the round-4 probe B).
      const mesh = decoratedStepBatch()
      const batchId = paste(mesh, 500, 50)

      expect(mesh.instanceOccurrenceIds[batchId]).toBe(4)
      expect(batchedModelOccurrenceTables(mesh).occurrencePaths[0]).toEqual([10, 11])
    })

    /**
     * A decorated two-batch model, as a load leaves it: occurrences 0 and 1
     * opaque, occurrence 2 translucent (so it lands in the second batch).
     *
     * @return {{model: object, opaque: object, glass: object}}
     */
    function twoBatchModel() {
      const translucent = {...RED, w: 0.5}
      const flatMeshes = [RED, RED, translucent].map((color, i) => ({
        expressID: 100 + i,
        geometries: [{
          geometryExpressID: SHAPE_ID,
          flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i * SPACING, 0, 0, 1],
          color,
          occurrencePath: [i + 1],
        }],
      }))
      const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriangleApi(), 0)
      decorateBatchMeshes(batches)
      expect(batches).toHaveLength(2)
      const model = new Group()
      batches.forEach((batch) => model.add(batch.mesh))
      const opaque = batches.find((batch) => !batch.transparent).mesh
      const glass = batches.find((batch) => batch.transparent).mesh
      expect(Array.from(opaque.instanceOccurrenceIds)).toEqual([0, 1])
      expect(Array.from(glass.instanceOccurrenceIds)).toEqual([2])
      return {model, opaque, glass}
    }

    it('mints one sequence per model, whichever batch or the root it is asked for', () => {
      // Round 5, finding 2: the mint was keyed by the object passed, so the
      // opaque batch minted 2 — the glass batch's occurrence.
      const {model, opaque, glass} = twoBatchModel()

      const minted = [mintOccurrenceId(opaque), mintOccurrenceId(glass), mintOccurrenceId(model)]

      expect(minted).toEqual([3, 4, 5])
      expect(mintGeometryId(glass)).toBe(SHAPE_ID + 1)
      expect(mintGeometryId(opaque)).toBe(SHAPE_ID + 2)
    })

    it('never mints a deleted instance\'s occurrence id, even when no mint came first', () => {
      // Round 5, finding 1 (probe P1): the floor was taken at the first mint,
      // over live rows, after the delete had cleared the maximum. The paste
      // then carried occurrence 3 — and the selection still naming it.
      const mesh = decoratedStepBatch()
      applyBatchedInstanceSelection(mesh, [3], {r: 0, g: 1, b: 1})
      deleteBatchedInstance(mesh, 3)

      const occurrenceId = mintOccurrenceId(mesh)
      const batchId = paste(mesh, 300, 50, occurrenceId)

      expect(occurrenceId).toBe(4)
      expect(mesh.getColorAt(batchId, new Color()).toArray()).toEqual([0.5, 0, 0.5])
    })

    it('never mints a deleted instance\'s occurrence id in another batch of the model', () => {
      const {model, glass} = twoBatchModel()
      deleteBatchedInstance(glass, 0) // occurrence 2, the model maximum
      expect(mintOccurrenceId(model)).toBe(3)
    })

    it('never mints a source geometry id whose every user was deleted', () => {
      // Probe P1b: with all four users of SHAPE_ID gone the mint returned 0.
      const mesh = decoratedStepBatch()
      for (const batchId of [0, 1, 2, 3]) {
        deleteBatchedInstance(mesh, batchId)
      }
      expect(mintGeometryId(mesh)).toBe(SHAPE_ID + 1)
    })

    it('never mints a source geometry id a re-shape took off the model', () => {
      // The re-shape is the first edit, so the floor has to be taken before it
      // rewrites the rows' source ids (here to 7, below SHAPE_ID).
      const mesh = decoratedStepBatch()
      const geometryId = mesh.getGeometryIdAt(0)
      for (const batchId of [0, 1, 2, 3]) {
        setBatchedInstanceGeometry(mesh, batchId, geometryId, 7)
      }
      expect(mintGeometryId(mesh)).toBe(SHAPE_ID + 1)
    })

    it('never mints an id an edit wrote explicitly', () => {
      const mesh = decoratedStepBatch()
      addBatchedInstance(mesh, mesh.getGeometryIdAt(0),
        {parent: 500, occurrenceId: 40, geometryId: 2000, color: PURPLE}, new Matrix4())
      expect(mintOccurrenceId(mesh)).toBe(41)
      expect(mintGeometryId(mesh)).toBe(2001)
    })
  })

  describe('created geometry is never deduped as source geometry (round 4 finding 1)', () => {
    it('reads each created shape back as itself, even when the rows share a source id', () => {
      // The round-4 probe A: both rows carry the same (here deliberately
      // colliding) source id, which the per-pass reader keyed on and so
      // handed the second shape the first one's triangles.
      const mesh = decoratedStepBatch()
      const g5 = addBatchedGeometry(mesh, triangle(5))
      const g7 = addBatchedGeometry(mesh, triangle(7))
      const shared = mintGeometryId(mesh)
      const b5 = addBatchedInstance(mesh, g5,
        {parent: 500, occurrenceId: 20, geometryId: shared, color: PURPLE}, new Matrix4())
      const b7 = addBatchedInstance(mesh, g7,
        {parent: 501, occurrenceId: 21, geometryId: shared, color: PURPLE}, new Matrix4())

      const read = makeInstanceGeometryReader()
      expect(positions(read(mesh, b5))).toEqual([0, 0, 0, 5, 0, 0, 0, 5, 0])
      expect(positions(read(mesh, b7))).toEqual([0, 0, 0, 7, 0, 0, 0, 7, 0])
      const subset = buildBatchedSubsetMesh(mesh, new Set([500, 501]))
      expect(positions(subset.geometry)).toEqual(
        [0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 0, 7, 0, 0, 0, 7, 0])
    })

    it('reads a created shape back as itself when its row reuses a source shape\'s id', () => {
      // Probe A2: the row says SHAPE_ID, the source unit triangle's id.
      const mesh = decoratedStepBatch()
      const g5 = addBatchedGeometry(mesh, triangle(5))
      const b5 = addBatchedInstance(mesh, g5,
        {parent: 500, occurrenceId: 20, geometryId: SHAPE_ID, color: PURPLE}, new Matrix4())

      const read = makeInstanceGeometryReader()
      expect(positions(read(mesh, 0))).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
      expect(positions(read(mesh, b5))).toEqual([0, 0, 0, 5, 0, 0, 0, 5, 0])
    })

    it('round-trips two created shapes through the batched artifact as themselves', async () => {
      // Probe A-export: the second shape hydrated with the first's triangles.
      const mesh = decoratedStepBatch()
      const shapes = [[500, triangle(5)], [501, triangle(7)]]
      for (const [parent, geometry] of shapes) {
        addBatchedInstance(mesh, addBatchedGeometry(mesh, geometry), {
          parent, occurrenceId: mintOccurrenceId(mesh), geometryId: mintGeometryId(mesh), color: PURPLE,
        }, new Matrix4())
      }

      const hydrated = await hydrate(await batchedArtifactBytes(mesh))

      const byParent = {}
      forEachActiveInstance(hydrated, (batchId) => {
        const parent = hydrated.instanceParents[batchId]
        if (parent >= 500) {
          byParent[parent] = positions(instanceGeometryAt(hydrated, batchId))
        }
      })
      expect(byParent).toEqual({
        500: [0, 0, 0, 5, 0, 0, 0, 5, 0],
        501: [0, 0, 0, 7, 0, 0, 0, 7, 0],
      })
    }, TIMEOUT_MS)
  })

  describe('one revision, one synchronous notification (round 4 findings 2, 3)', () => {
    it('reports every op, in order, with the retired row\'s ids on a delete', () => {
      const mesh = decoratedStepBatch()
      const seen = []
      onBatchEdit(mesh, (change) => {
        seen.push({revision: change.revision, events: change.events})
      })

      deleteBatchedInstance(mesh, 2)
      const batchId = paste(mesh, 500, 50)
      setBatchedInstanceMatrix(mesh, batchId, new Matrix4().makeTranslation(60, 0, 0))
      const geometryId = addBatchedGeometry(mesh, triangle(5))
      setBatchedInstanceGeometry(mesh, batchId, geometryId, mintGeometryId(mesh))

      expect(seen).toEqual([
        {revision: 1, events: [{kind: BatchEditKind.DELETE_INSTANCE, batchId: 2,
          parent: 200, occurrenceId: 2, geometryId: SHAPE_ID}]},
        {revision: 2, events: [{kind: BatchEditKind.ADD_INSTANCE, batchId: 2}]},
        {revision: 3, events: [{kind: BatchEditKind.SET_MATRIX, batchId: 2}]},
        {revision: 4, events: [{kind: BatchEditKind.ADD_GEOMETRY, geometryId}]},
        {revision: 5, events: [{kind: BatchEditKind.SET_GEOMETRY, batchId: 2}]},
      ])
      expect(batchEditRevision(mesh)).toBe(5)
    })

    it('reports a throwing listener instead of orphaning the edit', () => {
      // Round 5, finding 4: the throw reached the editor after the instance
      // existed, so the caller never learned its batch id.
      const mesh = decoratedStepBatch()
      const after = jest.fn()
      const bug = new Error('listener bug')
      onBatchEdit(mesh, () => {
        throw bug
      })
      onBatchEdit(mesh, after)
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
      captureException.mockClear()
      try {
        const batchId = paste(mesh, 500, 50)

        expect(batchId).toBe(4)
        expect(mesh.instanceParents[batchId]).toBe(500)
        expect(after).toHaveBeenCalledTimes(1)
        expect(consoleError).toHaveBeenCalledWith(
          '[batchedEdit] an edit listener failed; the edit stands', bug)
        expect(captureException).toHaveBeenCalledWith(bug)
      } finally {
        consoleError.mockRestore()
      }
    })

    it('refuses an edit made from inside a listener, before it changes anything', () => {
      // Round 5, finding 5: a nested edit made the later listeners' change
      // record describe a batch that no longer matched it.
      const mesh = decoratedStepBatch()
      let refused = null
      onBatchEdit(mesh, (change) => {
        try {
          deleteBatchedInstance(mesh, change.events[0].batchId)
        } catch (err) {
          refused = err
        }
      })

      const batchId = paste(mesh, 500, 50)

      expect(refused).toBeInstanceOf(BatchEditReentryError)
      expect(refused.message).toMatch(/listener tried to edit/)
      expect(mesh.instanceCount).toBe(5)
      expect(mesh.instanceParents[batchId]).toBe(500)
    })

    it('keeps the highlight consistent when a listener tries to undo an add', () => {
      // Probe P5b: an earlier listener deleted each add, so the highlight then
      // indexed a deleted id as live, and selecting its occurrence threw.
      const mesh = decoratedStepBatch()
      onBatchEdit(mesh, (change) => {
        deleteBatchedInstance(mesh, change.events[0].batchId)
      })
      applyBatchedInstanceSelection(mesh, [3], {r: 0, g: 1, b: 1})
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const batchId = paste(mesh, 500, 50, 9)

        expect(consoleError).toHaveBeenCalledWith(
          '[batchedEdit] an edit listener failed; the edit stands', expect.any(BatchEditReentryError))
        // The paste stands, indexed under its own occurrence and no other.
        expect(() => applyBatchedInstanceSelection(mesh, [0], {r: 0, g: 1, b: 1})).not.toThrow()
        expect(mesh.getColorAt(batchId, new Color()).toArray()).toEqual([0.5, 0, 0.5])
        applyBatchedInstanceSelection(mesh, [9], {r: 0, g: 1, b: 1})
        expect(mesh.getColorAt(batchId, new Color()).toArray()).toEqual([0, 1, 1])
      } finally {
        consoleError.mockRestore()
      }
    })

    it('stops delivering after unsubscribe', () => {
      const mesh = decoratedStepBatch()
      const listener = jest.fn()
      const unsubscribe = onBatchEdit(mesh, listener)
      unsubscribe()
      unsubscribe()

      deleteBatchedInstance(mesh, 3)

      expect(listener).not.toHaveBeenCalled()
      expect(batchEditListenerCount(mesh)).toBe(0)
    })

    it('paints a paste of a selected product as it lands, no highlight call after', () => {
      // Probe C, appended id: the selection is on product 200.
      const mesh = decoratedStepBatch()
      applyBatchedSelection(mesh, [200], {r: 0, g: 1, b: 1})

      const batchId = paste(mesh, 200, 50)

      expect(mesh.getColorAt(batchId, new Color()).toArray()).toEqual([0, 1, 1])
    })

    it('hides a paste made while residency is at target 0, before the next slider tick', () => {
      const mesh = decoratedStepBatch()
      const residency = new ResidencyController(mesh)
      residency.setTarget(0)

      const batchId = paste(mesh, 500, 50)

      expect(mesh.getVisibleAt(batchId)).toBe(false)
    })

    it('measures a moved instance where it now is', () => {
      // Probe E: a move left residency's center at the load-time position.
      const mesh = decoratedStepBatch()
      const residency = new ResidencyController(mesh)
      const revision = batchEditRevision(mesh)

      setBatchedInstanceMatrix(mesh, 3, new Matrix4().makeTranslation(500, 0, 0))

      expect(batchEditRevision(mesh)).toBe(revision + 1)
      expect(residency.instances.find((record) => record.index === 3).center.x).toBeCloseTo(500.5)
    })

    it('reframes after a delete + paste that leaves the instance count unchanged', () => {
      // robustBounds' cache key counted instances, so the same count meant a
      // cache hit on the old extent.
      const mesh = decoratedStepBatch()
      mesh.updateMatrixWorld(true)
      expect(robustBoundsFor(mesh).exactBox.max.x).toBeCloseTo(31)

      deleteBatchedInstance(mesh, 3)
      paste(mesh, 300, 500)

      expect(mesh.instanceCount).toBe(4)
      expect(robustBoundsFor(mesh).exactBox.max.x).toBeCloseTo(501)
    })

    it('drops three\'s whole-batch bounds, so a paste outside them is not culled', () => {
      // `decorateBatchMeshes` computed both at load (x 0..31); three only
      // recomputes a null one (WebGLRenderer.js:1886, Frustum.js:150,
      // Box3.js:339). A camera looking only at x = 500 would cull the whole
      // batch — the paste included — on the load-time sphere.
      const mesh = decoratedStepBatch()
      mesh.updateMatrixWorld(true)
      const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100)
      camera.position.set(500, 0, 10)
      camera.updateMatrixWorld(true)
      const frustum = new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      expect(frustum.intersectsObject(mesh)).toBe(false)

      paste(mesh, 500, 500)

      expect(frustum.intersectsObject(mesh)).toBe(true)
      expect(new Box3().setFromObject(mesh).max.x).toBeCloseTo(501)
    })

    it('stops residency following edits once it is disposed', () => {
      const mesh = decoratedStepBatch()
      const residency = new ResidencyController(mesh)
      residency.setTarget(0)
      expect(batchEditListenerCount(mesh)).toBe(1)

      const onEdit = jest.spyOn(residency, 'onBatchEdit_')

      residency.dispose()
      paste(mesh, 500, 50)

      expect(batchEditListenerCount(mesh)).toBe(0)
      expect(onEdit).not.toHaveBeenCalled()
    })

    it('subscribes the highlight once per batch, however many highlight calls', () => {
      const mesh = decoratedStepBatch()
      applyBatchedSelection(mesh, [100])
      applyBatchedSelection(mesh, [200])
      applyBatchedSelection(mesh, [300])
      expect(batchEditListenerCount(mesh)).toBe(1)
    })
  })

  describe('setBatchedInstanceGeometry', () => {
    it('moves the row\'s source id with the shape, so reads follow it', () => {
      const mesh = decoratedStepBatch()
      const geometryId = addBatchedGeometry(mesh, triangle(5))
      const sourceId = mintGeometryId(mesh)

      setBatchedInstanceGeometry(mesh, 1, geometryId, sourceId)

      expect(mesh.instanceGeometryIds[1]).toBe(sourceId)
      expect(mesh.instanceParents[1]).toBe(100)
      expect(mesh.occurrencePathToBatchIds.get('10/12')).toEqual([1])
      const read = makeInstanceGeometryReader()
      expect(positions(read(mesh, 0))).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
      expect(positions(read(mesh, 1))).toEqual([0, 0, 0, 5, 0, 0, 0, 5, 0])
    })

    it('refuses a re-shape with no source id', () => {
      const mesh = decoratedStepBatch()
      const geometryId = addBatchedGeometry(mesh, triangle(5))
      expect(() => setBatchedInstanceGeometry(mesh, 1, geometryId)).toThrow(BatchEditIdError)
      expect(mesh.getGeometryIdAt(1)).toBe(mesh.getGeometryIdAt(0))
    })
  })

  describe('modelHasPostLoadEdits', () => {
    it('is false for a model as loaded and true after any op', () => {
      const mesh = decoratedStepBatch()
      expect(modelHasPostLoadEdits(mesh)).toBe(false)

      setBatchedInstanceMatrix(mesh, 0, new Matrix4())

      expect(modelHasPostLoadEdits(mesh)).toBe(true)
    })
  })
})
