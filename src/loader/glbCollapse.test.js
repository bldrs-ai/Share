/* eslint-disable no-magic-numbers */
import {
  BatchedMesh,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Quaternion,
  Raycaster,
  Vector3,
} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import {BldrsInstanceTablesReader, rangeCanaryOf} from './bldrsInstanceTables'
import {BLDRS_SPATIAL_TREE_EXTENSION_NAME} from './bldrsSpatialTree'
import {bakeCollapsedBin, planCollapse} from './glbCollapse'
import {batchedArtifactBytes, triangleGeometry} from './glbArtifact.fixture'
import {exportBatchedModelAsInstancedGlb} from './glbBatchedExport'
import {injectGlbExtensions, parseGlb, serializeGlb} from './injectGlbExtensions'
import {COMPRESSION_MESHOPT, compressExportGlb} from '../export/glbCompression'
import {isPortableRewritable, rewriteGlbPortable} from '../export/glbPortable'
import {ResidencyController} from '../viewer/residency/ResidencyController'
import {makeInstanceGeometryReader} from '../viewer/ifc/batchedInstanceGeometry'
import {hydrateBatchedModelFromInstancedGlb} from '../viewer/ifc/instancedGlbToBatchedModel'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


/**
 * The collapsed batched artifact (share-140 #1871, glb-export-premium.md
 * §1.1d), end to end: live batched model → the real writer in collapse mode
 * → real GLTFLoader + tables plugin → hydration, compared against the SAME
 * model written the un-collapsed way.
 *
 * The comparison is the acceptance criterion: a collapsed artifact is not a
 * second kind of model, it is the same model written down in fewer bytes, so
 * every interaction surface — picking, palette, isolation, residency, and
 * the geometry every one of them reads — has to come back equal. Matrices are
 * deliberately NOT compared: a collapsed element's placement is baked into
 * its vertices and its instance matrix is the group's, so matrices differ
 * where the drawn picture is identical. What is compared is where each
 * element's triangles land in model space.
 */


const TIMEOUT_MS = 120000
const GREY = {x: 0.8, y: 0.8, z: 0.8, w: 1}
const RED = {x: 0.9, y: 0.1, z: 0.1, w: 1}
const SPACING = 10


/**
 * One placement of the hybrid fixture.
 *
 * @param {number} slot x-slot the element sits in, `SPACING` apart, so no
 *   ray is ambiguous
 * @param {object} [opts]
 * @param {number} [opts.rotateZ] radians about +z (stays in the z=0 plane)
 * @param {boolean} [opts.mirror] negative x scale — a mirrored placement
 * @return {Matrix4}
 */
function placement(slot, {rotateZ = 0, mirror = false} = {}) {
  return new Matrix4().compose(
    new Vector3(slot * SPACING, 0, 0),
    new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rotateZ),
    new Vector3(mirror ? -1 : 1, 1, 1))
}


/**
 * A hybrid batched model: one shape instanced twice (genuine instancing, so
 * it must stay an `EXT_mesh_gpu_instancing` node) and five single-placement
 * elements that collapse — two grey, one rotated grey, one mirrored grey and
 * one red, so the grey ones share a merged primitive and the red one gets its
 * own. Every single-placement shape is distinct, or content dedup (#1859)
 * would fold two of them into one instanced node before the collapse sees
 * them.
 *
 * Element k's triangle sits in x-slot `slots[k]`; `pickPoints` names a point
 * inside each one, in model space, for the ray tests.
 *
 * @return {{model: BatchedMesh, pickPoints: Array<Vector3>}}
 */
function liveHybridModel() {
  const mesh = new BatchedMesh(7, 30, 30)
  const shared = mesh.addGeometry(triangleGeometry(1))
  const singles = [2, 3, 4, 5, 6].map((size) => mesh.addGeometry(triangleGeometry(size)))
  const layout = [
    {geometryId: shared, matrix: placement(0), color: GREY},
    {geometryId: shared, matrix: placement(1), color: GREY},
    {geometryId: singles[0], matrix: placement(2), color: GREY},
    {geometryId: singles[1], matrix: placement(3), color: RED},
    {geometryId: singles[2], matrix: placement(4, {rotateZ: Math.PI / 2}), color: GREY},
    {geometryId: singles[3], matrix: placement(5, {mirror: true}), color: GREY},
    {geometryId: singles[4], matrix: placement(6), color: GREY},
  ]
  const pickPoints = []
  for (const {geometryId, matrix} of layout) {
    mesh.setMatrixAt(mesh.addInstance(geometryId), matrix)
    pickPoints.push(new Vector3(0.3, 0.3, 0).applyMatrix4(matrix))
  }
  mesh.instanceParents = [101, 102, 103, 104, 105, 106, 107]
  mesh.instanceOccurrenceIds = [0, 1, 2, 3, 4, 5, 6]
  mesh.instanceGeometryIds = [500, 500, 600, 700, 800, 900, 1000]
  mesh.instanceOccurrencePaths = [[1], [2], [3], [4], [5], [6], [7]]
  mesh.instanceSourceColors = layout.map(({color}) => ({...color}))
  return {model: mesh, pickPoints}
}


/**
 * Parse with a real GLTFLoader carrying the tables reader, then hydrate.
 *
 * @param {Uint8Array} bytes one standalone GLB
 * @param {boolean} [meshopt] register the Meshopt decoder
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
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    loader.parse(ab, '', resolve, reject)
  })
  return hydrateBatchedModelFromInstancedGlb(gltf.scene)
}


/**
 * Each placement's triangles in model space, keyed by occurrence id — the
 * geometry every consumer (isolation subsets, the merged conversion, GLB
 * re-export) reads back out of the batch.
 *
 * @param {object} model hydrated BatchedMesh
 * @return {Map<number, Array<number>>} flat xyz per occurrence, in triangle
 *   order
 */
function modelSpaceTriangles(model) {
  const read = makeInstanceGeometryReader()
  const matrix = new Matrix4()
  const v = new Vector3()
  const out = new Map()
  for (let batchId = 0; batchId < model.instanceParents.length; batchId++) {
    const geometry = read(model, batchId)
    model.getMatrixAt(batchId, matrix)
    const position = geometry.getAttribute('position')
    const flat = []
    for (const i of geometry.index.array) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrix)
      flat.push(v.x, v.y, v.z)
    }
    out.set(model.instanceOccurrenceIds[batchId], flat)
  }
  return out
}


/**
 * The unordered vertex set of one triangle list, rounded — so a triangle
 * whose winding the writer reversed compares equal to the original.
 *
 * @param {Array<number>} flat xyz
 * @return {Array<string>}
 */
function vertexSet(flat) {
  const out = []
  for (let i = 0; i < flat.length; i += 3) {
    out.push(flat.slice(i, i + 3).map((x) => x.toFixed(5)).join(','))
  }
  return out.sort()
}


/**
 * Every placement's identity, keyed by occurrence id.
 *
 * @param {object} model hydrated BatchedMesh
 * @return {Map<number, object>}
 */
function identities(model) {
  const out = new Map()
  for (let i = 0; i < model.instanceParents.length; i++) {
    out.set(model.instanceOccurrenceIds[i], {
      parent: model.instanceParents[i],
      geometryId: model.instanceGeometryIds[i],
      occurrencePath: model.instanceOccurrencePaths[i],
      source: {...model.instanceSourceColors[i]},
      display: {...model.instanceColors[i]},
    })
  }
  return out
}


/**
 * Which occurrence a ray straight down onto `point` picks.
 *
 * @param {object} model hydrated BatchedMesh
 * @param {Vector3} point model-space target
 * @return {?number} occurrence id
 */
function pickOccurrence(model, point) {
  model.updateMatrixWorld(true)
  const raycaster = new Raycaster(new Vector3(point.x, point.y, 5), new Vector3(0, 0, -1))
  const hits = []
  model.raycast(raycaster, hits)
  hits.sort((a, b) => a.distance - b.distance)
  return hits.length === 0 ? null : model.instanceOccurrenceIds[hits[0].batchId]
}


describe('collapsed batched artifact (#1871)', () => {
  it('collapses only single-placement groups, one merged primitive per colour', async () => {
    const {json} = parseGlb(await batchedArtifactBytes(liveHybridModel().model, {collapse: true}))

    const instanced = json.nodes.filter((n) => n.extensions?.EXT_mesh_gpu_instancing)
    const collapsed = json.nodes.filter((n) => !n.extensions?.EXT_mesh_gpu_instancing)
    // The shared shape keeps its instancing; five singles become two
    // primitives (grey, red) rather than five nodes.
    expect(instanced).toHaveLength(1)
    expect(collapsed).toHaveLength(2)
    expect(json.nodes).toHaveLength(3)
    // The group's offset is on the node (precision, glbCollapse.js rule 1).
    for (const node of collapsed) {
      expect(node.translation).toBeDefined()
    }
  })

  it('does not declare the instancing extension when nothing is instanced', async () => {
    // A fully-collapsed file that still REQUIRED EXT_mesh_gpu_instancing would
    // be refused outright by a viewer that does not implement it — the one
    // third-party outcome worse than the un-collapsed file.
    // Instance 0 without its twin is a single placement like the rest.
    const model = onlyInstances(liveHybridModel().model, [0, 2, 3])
    const {json} = parseGlb(await batchedArtifactBytes(model, {collapse: true}))

    expect(json.nodes.every((n) => !n.extensions?.EXT_mesh_gpu_instancing)).toBe(true)
    expect(json.extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing')
    expect(json.extensionsRequired ?? []).not.toContain('EXT_mesh_gpu_instancing')
  })

  it('leaves the artifact byte-identical when collapse is off', async () => {
    // The default-off promise, at the byte level: today's writer output does
    // not move, so nobody's cached artifact goes stale because this shipped.
    const {model} = liveHybridModel()
    const plain = await exportBatchedModelAsInstancedGlb(model)
    const explicit = await exportBatchedModelAsInstancedGlb(model, {collapse: false})

    expect(plain.collapsed).toBe(false)
    expect(Array.from(explicit.bytes)).toEqual(Array.from(plain.bytes))
    expect(plain.tableNodes.some((node) => node.ranges)).toBe(false)
  })

  describe('round trip against the un-collapsed artifact', () => {
    let reference
    let collapsed
    let pickPoints

    beforeAll(async () => {
      const live = liveHybridModel()
      pickPoints = live.pickPoints
      reference = await parseAndHydrate(await batchedArtifactBytes(live.model))
      collapsed = await parseAndHydrate(
        await batchedArtifactBytes(liveHybridModel().model, {collapse: true}))
    }, TIMEOUT_MS)

    it('hydrates, with every placement\'s identity and colour intact', () => {
      expect(collapsed).not.toBeNull()
      expect(collapsed.capabilities.batchedPicking).toBe(true)
      expect(identities(collapsed)).toEqual(identities(reference))
    })

    it('puts every element\'s triangles where the un-collapsed artifact does', () => {
      const want = modelSpaceTriangles(reference)
      const got = modelSpaceTriangles(collapsed)
      expect([...got.keys()].sort()).toEqual([...want.keys()].sort())
      for (const [occurrence, flat] of want) {
        expect(vertexSet(got.get(occurrence))).toEqual(vertexSet(flat))
      }
    })

    it('picks the same element under every ray', () => {
      pickPoints.forEach((point, occurrence) => {
        expect(pickOccurrence(reference, point)).toBe(occurrence)
        expect(pickOccurrence(collapsed, point)).toBe(occurrence)
      })
    })

    it('isolates each element to the same geometry', () => {
      for (const parent of [101, 103, 106]) {
        const bounds = [reference, collapsed].map((model) => {
          const meshes = model.createSubset({ids: [parent], customID: `iso${parent}`})
          const box = new Box3()
          for (const mesh of meshes) {
            mesh.updateMatrixWorld(true)
            box.union(new Box3().setFromObject(mesh))
          }
          return [...box.min.toArray(), ...box.max.toArray()].map((x) => x.toFixed(4))
        })
        expect(bounds[1]).toEqual(bounds[0])
      }
    })

    it('gives residency the same instances at the same places', () => {
      const summarise = (model) => new ResidencyController(model).instances
        .map((instance) => ({
          expressID: instance.expressID,
          center: instance.center.toArray().map((x) => x.toFixed(4)),
          radius: instance.radius.toFixed(4),
        }))
        .sort((a, b) => a.expressID - b.expressID)
      expect(summarise(collapsed)).toEqual(summarise(reference))
    })

    it('winds a mirrored element so its faces agree with its normals', () => {
      // Occurrence 5 is the mirrored placement. Its baked triangle's geometric
      // normal (right-hand rule over the index order) must point the same way
      // as the stored vertex normal, or every glTF viewer shades it
      // back-to-front.
      const read = makeInstanceGeometryReader()
      const batchId = Array.from(collapsed.instanceOccurrenceIds).indexOf(5)
      const geometry = read(collapsed, batchId)
      const p = geometry.getAttribute('position')
      const [a, b, c] = geometry.index.array
      const ab = new Vector3().fromBufferAttribute(p, b).sub(new Vector3().fromBufferAttribute(p, a))
      const ac = new Vector3().fromBufferAttribute(p, c).sub(new Vector3().fromBufferAttribute(p, a))
      const faceNormal = ab.cross(ac)
      const stored = new Vector3().fromBufferAttribute(geometry.getAttribute('normal'), a)
      expect(faceNormal.dot(stored)).toBeGreaterThan(0)
    })
  })

  it('keeps millimetre detail on a model placed 10^5 m from the origin', async () => {
    // glbCollapse.js rule 1: vertices are baked RELATIVE to the group, whose
    // offset stays on the node. What that preserves is the element's SHAPE.
    // Where the whole element lands is float32-quantised on every path —
    // the hydrated batch keeps instance matrices in a float32 texture, so a
    // translation of 1e5 moves in ~8 mm steps whether it came from an
    // instancing accessor or a collapsed node — but that is a rigid shift.
    // Baked against the world origin instead, each VERTEX would be a float32
    // near 1e5, and this 1 mm triangle would collapse to a sliver.
    const far = 1e5
    const mesh = new BatchedMesh(2, 6, 6)
    mesh.setMatrixAt(mesh.addInstance(mesh.addGeometry(triangleGeometry(0.001))),
      new Matrix4().makeTranslation(far, far, 0))
    mesh.setMatrixAt(mesh.addInstance(mesh.addGeometry(triangleGeometry(0.002))),
      new Matrix4().makeTranslation(far + 1, far, 0))
    mesh.instanceParents = [1, 2]
    mesh.instanceOccurrenceIds = [0, 1]
    mesh.instanceSourceColors = [{...GREY}, {...GREY}]

    const hydrated = await parseAndHydrate(await batchedArtifactBytes(mesh, {collapse: true}))
    const t = modelSpaceTriangles(hydrated).get(0)

    // Both legs of the 1 mm triangle, to a micrometre.
    expect(Math.abs((t[3] - t[0]) - 0.001)).toBeLessThan(1e-6)
    expect(Math.abs((t[7] - t[1]) - 0.001)).toBeLessThan(1e-6)
    // And the rigid placement stays within float32's own step at 1e5.
    expect(Math.abs(t[0] - far)).toBeLessThan(0.008)
  }, TIMEOUT_MS)

  it('re-collapses a re-opened collapsed artifact rather than un-collapsing it', async () => {
    // Re-export of a hydrated collapsed model: every element now has its own
    // baked slice, so content dedup keeps them apart and each is a
    // single-placement group again — the round trip preserves the saving.
    const first = await batchedArtifactBytes(liveHybridModel().model, {collapse: true})
    const hydrated = await parseAndHydrate(first)
    const second = await batchedArtifactBytes(hydrated, {collapse: true})

    expect(parseGlb(second).json.nodes).toHaveLength(parseGlb(first).json.nodes.length)
    const again = await parseAndHydrate(second)
    const want = modelSpaceTriangles(hydrated)
    for (const [occurrence, flat] of modelSpaceTriangles(again)) {
      expect(vertexSet(flat)).toEqual(vertexSet(want.get(occurrence)))
    }
  }, TIMEOUT_MS)

  it('refuses a file whose merged primitive was reordered after the write', async () => {
    // The canary, end to end: swap two elements' vertices in the file's own
    // BIN — what a reordering codec or an editing tool does — and the table,
    // which nothing touched, must stop being trusted. The model still renders
    // (the caller keeps the GLTFLoader scene); it just is not decorated.
    const bytes = await batchedArtifactBytes(liveHybridModel().model, {collapse: true})
    const {json, bin} = parseGlb(bytes)
    const grey = json.nodes.find((n) => !n.extensions?.EXT_mesh_gpu_instancing &&
      json.accessors[json.meshes[n.mesh].primitives[0].attributes.POSITION].count > 3)
    const accessor = json.accessors[json.meshes[grey.mesh].primitives[0].attributes.POSITION]
    const view = json.bufferViews[accessor.bufferView]
    const stride = view.byteStride ?? 12
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const tampered = bin.slice()
    // Rows 0 and 1 are one triangle each: swap their three vertices' xyz.
    for (let v = 0; v < 3; v++) {
      const a = tampered.slice(base + (v * stride), base + (v * stride) + 12)
      const b = tampered.slice(base + ((v + 3) * stride), base + ((v + 3) * stride) + 12)
      tampered.set(b, base + (v * stride))
      tampered.set(a, base + ((v + 3) * stride))
    }

    expect(await parseAndHydrate(bytes)).not.toBeNull()
    expect(await parseAndHydrate(serializeGlb(json, tampered))).toBeNull()
  }, TIMEOUT_MS)

  it('still hydrates after a Meshopt encode — positions stay bit-exact', async () => {
    // Meshopt leaves positions exact and never reorders (glbCompression.js),
    // so the exact canary survives it; this pins that the export a user is
    // steered toward re-opens with picking.
    const bytes = await batchedArtifactBytes(liveHybridModel().model, {collapse: true})
    const compressed = await compressExportGlb(bytes, COMPRESSION_MESHOPT)
    expect(compressed.mode).toBe(COMPRESSION_MESHOPT)

    const hydrated = await parseAndHydrate(compressed.withMetadata, true)

    expect(hydrated).not.toBeNull()
    expect(hydrated.capabilities.batchedPicking).toBe(true)
    expect(hydrated.instanceParents).toHaveLength(7)
  }, TIMEOUT_MS)
})


describe('portable export of a collapsed artifact (#1871)', () => {
  /** A STEP-flavoured tree naming all seven placements of the hybrid model. */
  const TREE = {
    expressID: 1,
    type: 'PRODUCT',
    Name: {value: 'Assembly'},
    children: [101, 102, 103, 104, 105, 106, 107].map((id, i) => ({
      expressID: id, type: 'PRODUCT', Name: {value: `Part ${id}`},
      occurrencePath: [i + 1], children: [],
    })),
  }

  /**
   * @param {boolean} collapse
   * @return {Promise<Uint8Array>} the hybrid artifact with its tree injected
   */
  async function artifact(collapse) {
    const bytes = await batchedArtifactBytes(liveHybridModel().model, {collapse})
    return injectGlbExtensions(bytes,
      [{name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: TREE, compress: true}], null, null).bytes
  }

  it('gives every collapsed element its own named mesh, bounded to itself', async () => {
    const portable = rewriteGlbPortable(await artifact(true))
    expect(portable.isChanged).toBe(true)
    expect(portable.stats.unassignedInstances).toBe(0)

    const {json} = parseGlb(portable.bytes)
    const part = (id) => json.nodes.find((node) => node.name === `Part ${id}`)
    // Five collapsed elements, five distinct meshes — where the collapsed
    // file had two (one per colour).
    const collapsedMeshes = new Set([103, 104, 105, 106, 107].map((id) => part(id).mesh))
    expect(collapsedMeshes.size).toBe(5)
    // Each element's POSITION bounds are ITS OWN, not its colour group's —
    // what a third-party viewer's selection box and framing read.
    for (const mesh of collapsedMeshes) {
      const position = json.accessors[json.meshes[mesh].primitives[0].attributes.POSITION]
      expect(position.count).toBe(3)
      const extent = position.max.map((max, c) => max - position.min[c])
      expect(Math.max(...extent)).toBeLessThanOrEqual(6)
    }
    expect(json.extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing')
  })

  it('does not grow the BIN — the split re-points accessors, it copies nothing', async () => {
    const source = parseGlb(await artifact(true))
    const portable = parseGlb(rewriteGlbPortable(await artifact(true)).bytes)
    expect(portable.bin.byteLength).toBeLessThanOrEqual(source.bin.byteLength)
  })

  it('hydrates back to the same model as the un-collapsed portable file', async () => {
    const reference = await parseAndHydrate(rewriteGlbPortable(await artifact(false)).bytes)
    const hydrated = await parseAndHydrate(rewriteGlbPortable(await artifact(true)).bytes)

    expect(hydrated).not.toBeNull()
    expect(hydrated.capabilities.batchedPicking).toBe(true)
    expect(identities(hydrated)).toEqual(identities(reference))
    const want = modelSpaceTriangles(reference)
    for (const [occurrence, flat] of modelSpaceTriangles(hydrated)) {
      expect(vertexSet(flat)).toEqual(vertexSet(want.get(occurrence)))
    }
    liveHybridModel().pickPoints.forEach((point, occurrence) => {
      expect(pickOccurrence(hydrated, point)).toBe(occurrence)
    })
  }, TIMEOUT_MS)

  it('leaves a collapsed node whole when its canary fails, rather than mislabel the split', async () => {
    // Codex on #1872: the split's own checks (tiling, containment) pass on a
    // file whose same-sized rows were swapped after the write, so without
    // the canary each slice would get the other row's name. Tamper exactly
    // that way — swap the grey bin's first two triangles in the BIN — and
    // the node must stay one unnamed placement instead.
    const {json, bin} = parseGlb(await artifact(true))
    const grey = json.nodes.find((n) => !n.extensions?.EXT_mesh_gpu_instancing &&
      json.accessors[json.meshes[n.mesh].primitives[0].attributes.POSITION].count > 3)
    const accessor = json.accessors[json.meshes[grey.mesh].primitives[0].attributes.POSITION]
    const view = json.bufferViews[accessor.bufferView]
    const stride = view.byteStride ?? 12
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const tampered = bin.slice()
    for (let v = 0; v < 3; v++) {
      const a = tampered.slice(base + (v * stride), base + (v * stride) + 12)
      const b = tampered.slice(base + ((v + 3) * stride), base + ((v + 3) * stride) + 12)
      tampered.set(b, base + (v * stride))
      tampered.set(a, base + ((v + 3) * stride))
    }

    const clean = rewriteGlbPortable(await artifact(true))
    const result = rewriteGlbPortable(serializeGlb(json, tampered))

    expect(clean.stats.unassignedInstances).toBe(0)
    // The whole grey bin is one placement under `Unassigned`, and no part
    // it holds is named with a mesh of its own.
    expect(result.stats.unassignedInstances).toBe(1)
    const out = parseGlb(result.bytes).json
    for (const id of [103, 105, 106, 107]) {
      expect(out.nodes.find((node) => node.name === `Part ${id}`).mesh).toBeUndefined()
    }
  })

  it('treats a FULLY collapsed file as rewritable, though it declares no instancing', async () => {
    const model = onlyInstances(liveHybridModel().model, [0, 2, 3])
    const {json} = parseGlb(await batchedArtifactBytes(model, {collapse: true}))
    expect(json.extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing')
    expect(isPortableRewritable(json)).toBe(true)
  })
})


describe('glbCollapse baking', () => {
  /**
   * @param {BufferGeometry} geometry
   * @param {Matrix4} matrix
   * @param {object} [color]
   * @return {object} a single-placement writer group
   */
  function single(geometry, matrix, color = GREY) {
    return {geometry, color, entries: [{matrix, parent: 1, occurrenceId: 0}]}
  }

  /**
   * @param {object} baked from bakeCollapsedBin
   * @return {BufferGeometry} the merged primitive as the reader would see it
   */
  function mergedOf(baked) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(baked.positions, 3))
    geometry.setIndex(new BufferAttribute(baked.indices, 1))
    return geometry
  }

  /**
   * @param {object} baked
   * @return {Array<object>} explicit ranges, as the parser expands them
   */
  function explicitRanges(baked) {
    let vertexStart = 0
    let indexStart = 0
    return baked.ranges.map(({vertexCount, indexCount}) => {
      const range = {vertexStart, vertexCount, indexStart, indexCount}
      vertexStart += vertexCount
      indexStart += indexCount
      return range
    })
  }

  it('rotates normals through the placement and renormalises them', () => {
    // A quarter turn about +x carries the triangle's +z normal to -y. Every
    // placement in the hybrid fixture keeps +z, so without this the normal
    // transform would be untested.
    const turn = new Matrix4().makeRotationX(Math.PI / 2)
    const baked = bakeCollapsedBin({color: GREY, groups: [single(triangleGeometry(), turn)]})
    for (let v = 0; v < 3; v++) {
      expect(baked.normals[(v * 3)]).toBeCloseTo(0, 6)
      expect(baked.normals[(v * 3) + 1]).toBeCloseTo(-1, 6)
      expect(baked.normals[(v * 3) + 2]).toBeCloseTo(0, 6)
    }
  })

  it('copies normals bit-exact under a pure translation', () => {
    const baked = bakeCollapsedBin(
      {color: GREY, groups: [single(triangleGeometry(), new Matrix4().makeTranslation(3, 4, 5))]})
    expect(Array.from(baked.normals)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1])
  })

  it('reverses the winding of a mirrored placement, and only that one', () => {
    const mirror = new Matrix4().makeScale(-1, 1, 1)
    const baked = bakeCollapsedBin({color: GREY, groups: [
      single(triangleGeometry(), new Matrix4()),
      single(triangleGeometry(2), mirror),
    ]})
    expect(Array.from(baked.indices)).toEqual([0, 1, 2, 3, 5, 4])
  })

  it('stores a canary the reader re-derives from the merged buffers', () => {
    // Writer half (per-row arrays) against reader half (merged + ranges): the
    // equality the whole witness rests on.
    const baked = bakeCollapsedBin({color: GREY, groups: [
      single(triangleGeometry(1), new Matrix4().makeTranslation(1, 0, 0)),
      single(triangleGeometry(2), new Matrix4().makeRotationZ(1)),
      single(triangleGeometry(3), new Matrix4().makeScale(-1, 2, 1)),
    ]})
    const table = {
      ranges: explicitRanges(baked),
      parents: baked.entries.map((e) => e.parent),
      occurrenceIds: baked.entries.map((e) => e.occurrenceId),
    }
    expect(rangeCanaryOf(mergedOf(baked), table)).toBe(baked.canary)
  })

  it('uses a Uint16 index while every vertex fits, Uint32 beyond', () => {
    const small = bakeCollapsedBin({color: GREY, groups: [single(triangleGeometry(), new Matrix4())]})
    expect(small.indices).toBeInstanceOf(Uint16Array)

    const big = new BufferGeometry()
    const count = 65537
    big.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    big.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3))
    big.setIndex(new BufferAttribute(new Uint32Array([0, 1, count - 1]), 1))
    const large = bakeCollapsedBin({color: GREY, groups: [single(big, new Matrix4())]})
    expect(large.indices).toBeInstanceOf(Uint32Array)
    expect(large.indices[2]).toBe(count - 1)
  })

  it('keeps a group instanced when its geometry would fail the reader\'s range check', () => {
    // An index past the geometry's own vertices would make
    // `addGeometryRanges` refuse the WHOLE table on read. Better to leave
    // that one element as its own node than to risk the model's picking.
    const broken = triangleGeometry()
    broken.setIndex(new BufferAttribute(new Uint32Array([0, 1, 3]), 1))
    const good = single(triangleGeometry(2), new Matrix4())
    const bad = single(broken, new Matrix4())
    const multi = {...single(triangleGeometry(3), new Matrix4()),
      entries: [{matrix: new Matrix4()}, {matrix: new Matrix4()}]}

    const {instanced, collapsed} = planCollapse([good, bad, multi], (c) => `${c.x}`)

    expect(instanced).toEqual([bad, multi])
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].groups).toEqual([good])
  })
})


/**
 * A copy of the model's batch restricted to some of its instances — how a
 * test builds a model with nothing genuinely instanced out of the hybrid one.
 *
 * @param {BatchedMesh} model
 * @param {Array<number>} batchIds instances to keep, in order
 * @return {BatchedMesh}
 */
function onlyInstances(model, batchIds) {
  const read = makeInstanceGeometryReader()
  const out = new BatchedMesh(batchIds.length, 30, 30)
  const matrix = new Matrix4()
  for (const batchId of batchIds) {
    model.getMatrixAt(batchId, matrix)
    out.setMatrixAt(out.addInstance(out.addGeometry(read(model, batchId))), matrix)
  }
  out.instanceParents = batchIds.map((id) => model.instanceParents[id])
  out.instanceOccurrenceIds = batchIds.map((id) => model.instanceOccurrenceIds[id])
  out.instanceSourceColors = batchIds.map((id) => ({...model.instanceSourceColors[id]}))
  return out
}
