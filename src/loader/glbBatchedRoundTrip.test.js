/* eslint-disable no-magic-numbers */
import {Matrix4} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import {BLDRS_SPATIAL_TREE_EXTENSION_NAME} from './bldrsSpatialTree'
import {BldrsInstanceTablesReader} from './bldrsInstanceTables'
import {batchedArtifactBytes, liveBatchedModel} from './glbArtifact.fixture'
import {injectGlbExtensions, parseGlb, serializeGlb} from './injectGlbExtensions'
import {COMPRESSION_MESHOPT, compressExportGlb} from '../export/glbCompression'
import {rewriteGlbPortable} from '../export/glbPortable'
import {hydrateBatchedModelFromInstancedGlb} from '../viewer/ifc/instancedGlbToBatchedModel'
import {isDefaultColor} from '../viewer/ifc/productPalette'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


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
 *
 * The model and the artifact bytes come from `glbArtifact.fixture.js`,
 * shared with `Loader.userOpenedArtifact.test.js` (which drives the same
 * bytes through `load()`).
 *
 * The second describe does the same for the PORTABLE shape of the SAME
 * artifact (#1849) — `rewriteGlbPortable` over these very bytes, so the input
 * is what the Export tab hands the user rather than a stub of it — and
 * asserts the two hydrate to the same model. That equality is the claim worth
 * having: a portable file is not a second kind of model the viewer has to
 * cope with, it is the same model written down differently.
 */


/**
 * A STEP-flavoured spatial tree naming `liveBatchedModel`'s three placements.
 *
 * STEP rather than IFC because `liveBatchedModel` carries occurrence paths,
 * and the portable rewrite joins on `parents` refined by `occurrencePaths`
 * (`glbPortable.js#collectInstances`). Naming every placement is what keeps
 * them out of the `Unassigned` root, so the file under test has the nesting a
 * real export has.
 */
const STEP_TREE = {
  expressID: 1,
  type: 'PRODUCT',
  Name: {value: 'Assembly'},
  children: [
    {expressID: 11, type: 'PRODUCT', Name: {value: 'Nut A'}, occurrencePath: [3, 7], children: []},
    {expressID: 12, type: 'PRODUCT', Name: {value: 'Nut B'}, occurrencePath: [3, 8], children: []},
    {expressID: 20, type: 'PRODUCT', Name: {value: 'Plate'}, occurrencePath: [4], children: []},
  ],
}

// Instantiating the Meshopt wasm decoder on a loaded CI worker outruns jest's
// default 5s.
const TIMEOUT_MS = 120000


/**
 * Build the artifact, then parse it with a real GLTFLoader carrying the
 * reader plugin.
 *
 * @param {object} model live batched model
 * @param {object} [sceneExtras] the `scenes[0].extras` map the writer stamps
 *   in the same inject pass (title, applied coordination frame). Null for the
 *   table-only cases, which is what the writer passes when neither exists.
 * @return {Promise<object>} the hydrated model (or null)
 */
async function roundTrip(model, sceneExtras = null) {
  return parseAndHydrate(await batchedArtifactBytes(model, {sceneExtras}))
}


/**
 * Parse GLB bytes with a real GLTFLoader carrying the tables reader, then
 * hydrate — the read half of both round trips below.
 *
 * @param {Uint8Array} bytes one standalone GLB
 * @param {boolean} [meshopt] register the Meshopt decoder (a compressed file
 *   fails the parse outright without it — `Loader.js#configureGltfDecoders`)
 * @return {Promise<object>} the hydrated model (or null)
 */
async function parseAndHydrate(bytes, meshopt = false) {
  const loader = new GLTFLoader()
  loader.register((parser) => new BldrsInstanceTablesReader(parser))
  if (meshopt) {
    await MeshoptDecoder.ready
    loader.setMeshoptDecoder(MeshoptDecoder)
  }
  const gltf = await new Promise((resolve, reject) => {
    // Copy into a standalone ArrayBuffer — GLTFLoader requires the buffer
    // to start at the GLB header.
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    loader.parse(ab, '', resolve, reject)
  })
  expect(gltf.scene.userData.bldrsInstanceTables).toBeTruthy()
  return hydrateBatchedModelFromInstancedGlb(gltf.scene)
}


/**
 * The batched-native artifact for `liveBatchedModel`, carrying the spatial
 * tree a real IFC/STEP cache write injects beside the tables.
 *
 * @return {Promise<Uint8Array>} the artifact's chunk 0
 */
async function artifactWithTree() {
  const bytes = await batchedArtifactBytes(liveBatchedModel())
  return injectGlbExtensions(
    bytes,
    [{name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: STEP_TREE, compress: true}],
    null, null).bytes
}


/**
 * Every instance's world placement, as flat matrix elements indexed by batch
 * id — the comparable the two shapes must agree on.
 *
 * @param {object} model hydrated BatchedMesh
 * @return {Array<Array<number>>}
 */
function instanceMatrices(model) {
  const m = new Matrix4()
  const out = []
  for (let i = 0; i < model.instanceParents.length; i++) {
    model.getMatrixAt(i, m)
    out.push(Array.from(m.elements))
  }
  return out
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

  it('carries BOTH halves of the render-frame mapping across the artifact (Share#1633 item 1)', async () => {
    // The batched-native writer's half of the frame round-trip (the merged
    // writer's is in `glbExport.test.js`). This is the path that made the
    // claim worth testing: `exportBatchedModelAsInstancedGlb` builds a fresh
    // gltf-transform Document and never looks at `model.userData`, so a stamp
    // left on the model reaches the artifact on NO path — the frame has to
    // travel as scene extras, and this asserts it arrives all the way at the
    // hydrated model, where a consumer reads it.
    //
    // Nothing between here and there is stubbed: real injection, real
    // GLTFLoader (whose auto-promotion of `scenes[0].extras` onto
    // `scene.userData` is the mechanism under test), real hydration (whose
    // userData merge is the other half).
    const frame = [
      0.001, 0, 0, 0,
      0, 0, -0.001, 0,
      0, 0.001, 0, 0,
      -2600, 450, 1200, 1,
    ]
    const offset = [2600000, 450, -1200000]

    const hydrated = await roundTrip(
      liveBatchedModel(), {appliedCoordination: frame, coordinationOffset: offset})

    expect(hydrated).not.toBeNull()
    // Same keys a fresh conway parse stamps — one surface, both paths.
    expect(hydrated.userData.appliedCoordination).toEqual(frame)
    // BOTH halves of `rendered = (A * world) - coordinationOffset`. The
    // degraded path bakes the offset into the geometry in this very
    // artifact, so a hit that restored only the frame would reconstruct
    // coordinates displaced by exactly it.
    expect(hydrated.userData.coordinationOffset).toEqual(offset)
  })

  it('leaves no frame on the model when the writer stamped none', async () => {
    // Pre-conway#702 engines and non-IFC sources: absence must stay absence,
    // never an empty or zeroed frame that a consumer would invert.
    const hydrated = await roundTrip(liveBatchedModel())

    expect(hydrated).not.toBeNull()
    expect(hydrated.userData.appliedCoordination).toBeUndefined()
    expect(hydrated.userData.coordinationOffset).toBeUndefined()
  })

  it('carries the frame alone on a healthy load (backstop never fired)', async () => {
    // The normal case since the conway#680 fix chain — the two keys are
    // independent, so a model with no backstop offset still gets its frame.
    const frame = [
      0.001, 0, 0, 0,
      0, 0, -0.001, 0,
      0, 0.001, 0, 0,
      -2600, 450, 1200, 1,
    ]

    const hydrated = await roundTrip(liveBatchedModel(), {appliedCoordination: frame})

    expect(hydrated).not.toBeNull()
    expect(hydrated.userData.appliedCoordination).toEqual(frame)
    expect(hydrated.userData.coordinationOffset).toBeUndefined()
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


describe('portable GLB round-trip (rewrite -> GLTFLoader -> hydrate, #1849)', () => {
  it('hydrates to the SAME model the batched-native artifact does', async () => {
    const source = await artifactWithTree()
    const portable = rewriteGlbPortable(source)
    expect(portable.isChanged).toBe(true)
    // Nothing was orphaned: the tree names all three placements, so the file
    // under test is the nested shape, not a flat `Unassigned` list.
    expect(portable.stats.unassignedInstances).toBe(0)

    const native = await parseAndHydrate(source)
    const hydrated = await parseAndHydrate(portable.bytes)

    expect(hydrated).not.toBeNull()
    expect(hydrated.isBatchedMesh).toBe(true)
    // The acceptance criterion from #1849: interchangeable to the viewer.
    expect(Array.from(hydrated.instanceParents)).toEqual(Array.from(native.instanceParents))
    expect(instanceMatrices(hydrated)).toEqual(instanceMatrices(native))
    expect(Array.from(hydrated.instanceGeometryIds))
      .toEqual(Array.from(native.instanceGeometryIds))
    expect(hydrated.instanceOccurrencePaths).toEqual(native.instanceOccurrencePaths)
    expect(hydrated.instanceColors).toEqual(native.instanceColors)
    // The interaction surfaces #1849 exists to restore.
    expect(hydrated.createSubset).toBeInstanceOf(Function)
    expect(hydrated.capabilities.batchedPicking).toBe(true)
    expect(hydrated.occurrencePathToBatchIds.size).toBe(native.occurrencePathToBatchIds.size)
    // `decorateBatchMeshes` ran: the bounds it computes are what the pick
    // path narrows with before the BVH (which is prototype-patched at
    // runtime and absent under the Jest `three` build).
    expect(hydrated.boundingSphere).toBeTruthy()
  })

  it('comes back palette-colored, not grey', async () => {
    // The visible half of #1849. Before it, a portable file fell through to
    // the plain GLTFLoader model, which never reaches `applyProductPalette`.
    const portable = rewriteGlbPortable(await artifactWithTree())
    const hydrated = await parseAndHydrate(portable.bytes)

    for (const source of hydrated.instanceSourceColors) {
      expect(isDefaultColor(source)).toBe(true)
    }
    expect(isDefaultColor(hydrated.instanceColors[0])).toBe(false)
  })

  it('folds an ancestor transform into every placement below it', async () => {
    // Portable nodes are nested, so a placement's matrix is the product down
    // the chain. Today's rewrite never puts a TRS on a node with children,
    // but the FILE may: any tool that re-parents or hoists a transform
    // produces this, and every other glTF viewer would draw it shifted.
    const portable = rewriteGlbPortable(await artifactWithTree())
    const {json, bin} = parseGlb(portable.bytes)
    const assembly = json.nodes.find((node) => node.name === 'Assembly')
    expect(assembly.children).toHaveLength(3)
    expect(assembly.translation).toBeUndefined()
    assembly.translation = [100, 0, 0]

    const hydrated = await parseAndHydrate(serializeGlb(json, bin))

    const shifted = instanceMatrices(hydrated).map((m) => m[12])
    const base = instanceMatrices(await parseAndHydrate(portable.bytes)).map((m) => m[12])
    expect(shifted).toEqual(base.map((x) => x + 100))
  })

  it('still hydrates after a Meshopt encode — the file a user downloads', async () => {
    // Portable and a codec are independent toggles, and "portable + Meshopt"
    // is the combination the Export tab's defaults steer toward. The encode
    // rebuilds the whole document through `@gltf-transform`; that the extras
    // stamp survives it is pinned in `glbPortable.test.js`, and this asserts
    // the surviving stamp is enough to get the model back.
    //
    // Meshopt only: DRACO decodes on a Worker built from a blob URL, which
    // jsdom has none of, so no Draco file can be read back through a
    // GLTFLoader here (the same gap `glbCompression`'s read tests note).
    const portable = rewriteGlbPortable(await artifactWithTree())
    const compressed = await compressExportGlb(portable.bytes, COMPRESSION_MESHOPT)
    expect(compressed.mode).toBe(COMPRESSION_MESHOPT)
    // Not a pass-through: the encoder fallback (#1842) would leave a mode of
    // null and a file with no codec in it, and the read below would prove
    // nothing about a compressed file.
    expect(parseGlb(compressed.withMetadata).json.extensionsUsed)
      .toContain('EXT_meshopt_compression')

    const hydrated = await parseAndHydrate(compressed.withMetadata, true)

    expect(hydrated).not.toBeNull()
    expect(hydrated.isBatchedMesh).toBe(true)
    expect(Array.from(hydrated.instanceParents)).toEqual([11, 12, 20])
    expect(hydrated.capabilities.batchedPicking).toBe(true)
  }, TIMEOUT_MS)

  it('degrades to the plain GLTF model when the stamps are gone', async () => {
    // Fail-soft is the contract, not an accident: a portable file whose
    // `extras` a tool dropped must render, not throw.
    const portable = rewriteGlbPortable(await artifactWithTree())
    const {json, bin} = parseGlb(portable.bytes)
    for (const node of json.nodes) {
      delete node.extras
    }

    expect(await parseAndHydrate(serializeGlb(json, bin))).toBeNull()
  })
})
