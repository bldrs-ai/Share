/* eslint-disable no-magic-numbers */
import {BufferAttribute, BufferGeometry, Matrix4} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
  BldrsInstanceTablesReader,
  buildInstanceTablesExtensionData,
} from './bldrsInstanceTables'
import {exportBatchedModelAsInstancedGlb} from './glbBatchedExport'
import {injectGlbExtensions} from './injectGlbExtensions'
import {hydrateBatchedModelFromInstancedGlb} from '../viewer/ifc/instancedGlbToBatchedModel'
import {isDefaultColor} from '../viewer/ifc/productPalette'


/**
 * FULL batched-native artifact round-trip: live batched model -> writer
 * bytes -> extension injection -> real GLTFLoader parse -> reader plugin ->
 * hydration -> parity assertions.
 *
 * This is the automated evidence for the stored-format risk checks in
 * design/new/model-display-controls.md §1.2 that the flow-test harness
 * CANNOT provide: the GLB cache is OPFS-backed and `OPFS_IS_ENABLED` is
 * false in the playwright build (flipping it breaks ~80 specs — see
 * tools/esbuild/vars.playwright.js and the two test.fixme'd *.cacheHit
 * specs). Everything except the OPFS read/write itself is exercised here
 * against the real three GLTFLoader, so the layout, the extension
 * envelope, the node<->table join, and the palette re-derivation are all
 * covered by CI rather than by hand.
 *
 * Covers risk check 2 (round-trip parity) and 3 (re-derive determinism);
 * check 1 (schema-slot gating) is pinned in glbCompress.test.js, and check
 * 4 (third-party appearance) in glbBatchedExport.test.js.
 */


const GREY = {x: 0.8, y: 0.8, z: 0.8, w: 1}


/** @return {BufferGeometry} one-triangle indexed geometry */
function triangleGeometry() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  geometry.setAttribute('normal', new BufferAttribute(
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
  return geometry
}


/**
 * A decorated batched model as `assembleBatchedModel` leaves it: a shared
 * part instanced twice plus a second part, colorless (palette-eligible),
 * already palette-painted in `instanceColors` with the grey preserved in
 * `instanceSourceColors`.
 *
 * @return {object} model double
 */
function liveBatchedModel() {
  const shared = triangleGeometry()
  const other = triangleGeometry()
  const matrices = [
    new Matrix4().makeTranslation(1, 0, 0),
    new Matrix4().makeTranslation(2, 0, 0),
    new Matrix4().makeTranslation(0, 3, 0),
  ]
  return {
    isBatchedMesh: true,
    instanceGeometry: [shared, shared, other],
    instanceParents: [11, 12, 20],
    instanceOccurrenceIds: [0, 1, 2],
    instanceGeometryIds: [500, 500, 600],
    instanceOccurrencePaths: [[3, 7], [3, 8], [4]],
    instanceSourceColors: [{...GREY}, {...GREY}, {...GREY}],
    // What the live scene shows after the palette ran — must NOT be what
    // gets baked.
    instanceColors: [
      {x: 0.306, y: 0.475, z: 0.655, w: 1},
      {x: 0.306, y: 0.475, z: 0.655, w: 1},
      {x: 0.949, y: 0.557, z: 0.169, w: 1},
    ],
    getMatrixAt(i, m) {
      m.copy(matrices[i])
    },
  }
}


/**
 * Serialize + inject the tables the way `exportAndCacheGlb` does, then
 * parse with a real GLTFLoader carrying the reader plugin.
 *
 * @param {object} model live batched model
 * @return {Promise<object>} the hydrated model (or null)
 */
async function roundTrip(model) {
  const written = await exportBatchedModelAsInstancedGlb(model)
  expect(written).not.toBeNull()

  const {bytes} = injectGlbExtensions(written.bytes, [{
    name: BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
    data: buildInstanceTablesExtensionData(written.tableNodes),
    compress: true,
  }], null, null)

  const loader = new GLTFLoader()
  loader.register((parser) => new BldrsInstanceTablesReader(parser))
  const gltf = await new Promise((resolve, reject) => {
    // Copy into a standalone ArrayBuffer — GLTFLoader requires the buffer
    // to start at the GLB header.
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    loader.parse(ab, '', resolve, reject)
  })
  expect(gltf.scene.userData.bldrsInstanceTables).toBeTruthy()
  return hydrateBatchedModelFromInstancedGlb(gltf.scene)
}


describe('batched-native GLB round-trip (writer -> GLTFLoader -> hydrate)', () => {
  it('restores the batched shape and identity tables', async () => {
    const hydrated = await roundTrip(liveBatchedModel())

    expect(hydrated).not.toBeNull()
    expect(hydrated.isBatchedMesh).toBe(true)
    expect(Array.from(hydrated.instanceParents).sort((a, b) => a - b)).toEqual([11, 12, 20])
    expect(Array.from(hydrated.instanceGeometryIds).sort((a, b) => a - b)).toEqual([500, 500, 600])
    expect(hydrated.instanceOccurrencePaths).toHaveLength(3)
    expect(hydrated.createSubset).toBeInstanceOf(Function)
    expect(hydrated.capabilities.batchedPicking).toBe(true)
  })

  it('carries SOURCE colors through the artifact, not the display palette', async () => {
    const hydrated = await roundTrip(liveBatchedModel())
    // The writer baked grey; the reader's snapshot is grey — so "Source"
    // has something to revert to after a cache hit (§1.2b).
    for (const source of hydrated.instanceSourceColors) {
      expect(isDefaultColor(source)).toBe(true)
    }
  })

  it('re-derives the same palette a fresh parse would (risk check 3)', async () => {
    const live = liveBatchedModel()
    const hydrated = await roundTrip(live)

    // Per-part grouping preserved: the shared part's two instances share a
    // color, the other part differs — and the actual values match what the
    // live model was showing before the round-trip.
    const byParent = new Map()
    for (let i = 0; i < hydrated.instanceParents.length; i++) {
      byParent.set(hydrated.instanceParents[i], hydrated.instanceColors[i])
    }
    expect(byParent.get(11)).toEqual(byParent.get(12))
    expect(byParent.get(20)).not.toEqual(byParent.get(11))
    expect(byParent.get(11)).toEqual(live.instanceColors[0])
    expect(byParent.get(20)).toEqual(live.instanceColors[2])
  })

  it('round-trips instance transforms', async () => {
    const hydrated = await roundTrip(liveBatchedModel())
    const seen = []
    const m = new Matrix4()
    for (let i = 0; i < hydrated.instanceParents.length; i++) {
      hydrated.getMatrixAt(i, m)
      seen.push([m.elements[12], m.elements[13]].map((v) => Math.round(v)))
    }
    expect(seen.sort()).toEqual([[0, 3], [1, 0], [2, 0]].sort())
  })
})
