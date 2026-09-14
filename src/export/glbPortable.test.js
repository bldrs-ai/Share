/* eslint-disable no-magic-numbers */
// The portable rewrite against REAL artifact bytes: `glbArtifact.fixture.js`
// builds a batched model and runs the actual writer over it, so what is
// rewritten here is the shape the cache produces rather than a hand-rolled
// approximation of it (the fixture's own module doc says why that distinction
// has already cost this codebase a bug).
//
// Two claims need the real thing and not a stub. That the geometry survives
// BYTE for byte — the whole reason this is JSON surgery rather than a
// gltf-transform round trip — is only checkable against accessors that
// actually address a BIN chunk. And that a generic viewer sees a named,
// nested hierarchy is a property of what three's `GLTFLoader` makes of the
// file, not of what the JSON looks like to a test.
//
// The codec pairing at the bottom runs the real Meshopt and DRACO encoders,
// planting the DRACO global the page's `<script>` injection would define,
// exactly as `glbCompression.test.js` does. Whether gltf-transform carries a
// node's `name`, `extras` and children through `readBinary`/`writeBinary` is a
// property of that library and could not be settled by reading it.
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as pako from 'pako'
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
} from '../loader/bldrsInstanceTables'
import {BLDRS_SPATIAL_TREE_EXTENSION_NAME} from '../loader/bldrsSpatialTree'
import {batchedArtifactBytes, liveBatchedModel, mergedGlbBytes} from '../loader/glbArtifact.fixture'
import {injectGlbExtensions, parseGlb} from '../loader/injectGlbExtensions'
import {
  COMPRESSION_DRACO,
  COMPRESSION_MESHOPT,
  compressExportGlb,
} from './glbCompression'
import {
  INSTANCING_EXTENSION_NAME,
  UNASSIGNED_NODE_NAME,
  isPortableRewritable,
  rewriteGlbPortable,
} from './glbPortable'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


// Instantiating a wasm encoder on a loaded CI worker outruns jest's default 5s.
const TIMEOUT_MS = 120000
const DRACO_DIR = path.resolve(__dirname, '../../public/static/js/draco')


// The IFC spatial tree that names `liveBatchedModel`'s three instances
// (`instanceParents` 11, 12, 20). Five nodes, and each naming shape the
// rewrite has to handle: an authored `Name`, a `LongName` that must WIN over
// a `Name` beside it (`reifyName`'s order, and the opposite of what #1843's
// body said), and an element with neither, which falls back to its prettified
// type plus its expressID.
const IFC_TREE = {
  expressID: 1,
  type: 'IFCPROJECT',
  Name: {value: 'Bldrs'},
  children: [{
    expressID: 10,
    type: 'IFCBUILDINGSTOREY',
    Name: {value: 'Ignored'},
    LongName: {value: 'Level 1'},
    children: [
      {expressID: 11, type: 'IFCWALL', Name: {value: 'Wall A'}, children: []},
      {expressID: 12, type: 'IFCWALL', children: []},
      {expressID: 20, type: 'IFCSLAB', Name: {value: 'Slab'}, children: []},
    ],
  }],
}
const IFC_TREE_NODE_COUNT = 5

// The STEP twin: one part type reused at two occurrences, which is exactly the
// case `parents` alone cannot tell apart — both copies of the shared geometry
// are parent 11 in `liveBatchedModel`, and only `occurrencePath` separates
// them.
const STEP_TREE = {
  expressID: 1,
  type: 'PRODUCT',
  Name: {value: 'Assembly'},
  children: [
    {expressID: 11, type: 'PRODUCT', Name: {value: 'Nut'}, occurrencePath: [3, 7], children: []},
    {expressID: 11, type: 'PRODUCT', Name: {value: 'Nut'}, occurrencePath: [3, 8], children: []},
    {expressID: 20, type: 'PRODUCT', Name: {value: 'Plate'}, occurrencePath: [4], children: []},
  ],
}


/**
 * A batched-native artifact carrying a spatial tree, the way a real IFC cache
 * write produces one.
 *
 * @param {object} [options]
 * @param {?object} [options.tree] The `BLDRS_spatial_tree` payload
 * @param {function(object): object} [options.mutateModel] Adjust the live
 *   batched model before the writer sees it
 * @return {Promise<Uint8Array>} the artifact's chunk 0
 */
async function artifactWithTree({tree = IFC_TREE, mutateModel = null} = {}) {
  const model = liveBatchedModel()
  if (mutateModel) {
    mutateModel(model)
  }
  const bytes = await batchedArtifactBytes(model)
  if (!tree) {
    return bytes
  }
  return injectGlbExtensions(
    bytes, [{name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: tree, compress: true}], null, null).bytes
}


/**
 * The IFC-flavoured model: `liveBatchedModel` carries STEP occurrence paths,
 * and an IFC one has none, so its instances join on `parents` alone.
 *
 * @param {object} model
 */
function asIfcModel(model) {
  model.instanceOccurrencePaths = null
}


/**
 * Every node of a parsed portable GLB that carries geometry.
 *
 * @param {object} json Parsed glTF JSON
 * @return {Array<object>}
 */
function meshBearingNodes(json) {
  return (json.nodes || []).filter((node) => Number.isInteger(node.mesh))
}


/**
 * The node named `name`, asserted unique so a rename that collides two
 * elements cannot slip through as "found one".
 *
 * @param {object} json Parsed glTF JSON
 * @param {string} name
 * @return {object}
 */
function nodeNamed(json, name) {
  const found = (json.nodes || []).filter((node) => node.name === name)
  expect(found).toHaveLength(1)
  return found[0]
}


// What one element of an accessor weighs, so the reader below can walk a
// STRIDED view: the batched writer's positions and normals are interleaved
// into one bufferView (`byteStride: 24`), and slicing the whole view would
// compare a normal against a position.
const COMPONENT_BYTES = {5125: 4, 5126: 4}
const COMPONENT_COUNTS = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}


/**
 * The bytes an accessor addresses, so "byte-identical geometry" can be
 * asserted across a rewrite that moves every bufferView.
 *
 * @param {object} json Parsed glTF JSON
 * @param {?Uint8Array} bin Its BIN chunk
 * @param {number} accessorIndex
 * @return {Uint8Array}
 */
function accessorBytes(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex]
  const view = json.bufferViews[accessor.bufferView]
  const elementBytes = COMPONENT_BYTES[accessor.componentType] * COMPONENT_COUNTS[accessor.type]
  const stride = view.byteStride || elementBytes
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const out = new Uint8Array(accessor.count * elementBytes)
  for (let e = 0; e < accessor.count; e++) {
    out.set(bin.subarray(base + (e * stride), base + (e * stride) + elementBytes), e * elementBytes)
  }
  return out
}


/**
 * The geometry of every mesh primitive, keyed by mesh index, as raw bytes.
 *
 * @param {Uint8Array} glbBytes
 * @return {Array<object>} `[{POSITION: Uint8Array, NORMAL: …, indices: …}]`
 */
function geometryBytesByMesh(glbBytes) {
  const {json, bin} = parseGlb(glbBytes)
  return json.meshes.map((mesh) => {
    const primitive = mesh.primitives[0]
    const out = {indices: accessorBytes(json, bin, primitive.indices)}
    for (const [name, index] of Object.entries(primitive.attributes)) {
      out[name] = accessorBytes(json, bin, index)
    }
    return out
  })
}


/**
 * A root `BLDRS_*` payload, ungzipped back into an object.
 *
 * @param {Uint8Array} glbBytes
 * @param {string} name
 * @return {?object}
 */
function payloadOf(glbBytes, name) {
  const {json, bin} = parseGlb(glbBytes)
  const entry = json.extensions?.[name]
  if (!entry) {
    return null
  }
  const view = json.bufferViews[entry.bufferView]
  const at = view.byteOffset ?? 0
  return JSON.parse(pako.ungzip(bin.subarray(at, at + view.byteLength), {to: 'string'}))
}


/**
 * What three's `GLTFLoader` will call a node: it runs every name through
 * `PropertyBinding.sanitizeNodeName`, which replaces spaces (and `.`, `:`,
 * `/`) with `_` so the name can address an animation track. The FILE keeps the
 * name as written — Blender and 3dviewer.net show "Level 1" — so this
 * mangling is three's alone, and the assertions that matter about naming read
 * the JSON. The parse test below still has to expect it.
 *
 * @param {string} name
 * @return {string}
 */
function asThreeName(name) {
  return name.replace(/[\s.:]/g, '_')
}


/**
 * Parse a GLB the way a third-party viewer would, and flatten what three
 * builds into `name → parent name` pairs.
 *
 * @param {Uint8Array} glbBytes
 * @return {Promise<Array<{name: string, parent: ?string, isMesh: boolean}>>}
 */
async function parseHierarchy(glbBytes) {
  const ab = new ArrayBuffer(glbBytes.byteLength)
  new Uint8Array(ab).set(glbBytes)
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(ab, './', resolve, reject)
  })
  const out = []
  gltf.scenes[0].traverse((object) => {
    if (object === gltf.scenes[0]) {
      return
    }
    out.push({
      name: object.name,
      parent: object.parent === gltf.scenes[0] ? null : object.parent.name,
      isMesh: Boolean(object.isMesh),
    })
  })
  return out
}


/**
 * Plant the DRACO encoder global the page's `<script>` injection defines.
 * Same trick, and the same reason, as `glbCompression.test.js`.
 */
function installDracoEncoder() {
  const factory = require(path.join(DRACO_DIR, 'draco_encoder.js'))
  const wasmBinary = new Uint8Array(readFileSync(path.join(DRACO_DIR, 'draco_encoder.wasm')))
  window.DracoEncoderModule = (options) => factory({...options, wasmBinary})
}


describe('export/glbPortable', () => {
  describe('what it will and will not touch', () => {
    it('leaves a merged-layout artifact exactly as it found it', () => {
      // No instancing extension, so nothing to expand — and re-serialising a
      // file to byte-for-byte the same content is a risk taken for no gain.
      const bytes = mergedGlbBytes()

      const result = rewriteGlbPortable(bytes)

      expect(result.isChanged).toBe(false)
      expect(result.bytes).toBe(bytes)
    })

    it('leaves an already-portable file alone, so a second pass is a no-op', async () => {
      const once = rewriteGlbPortable(await artifactWithTree())
      expect(once.isChanged).toBe(true)

      const twice = rewriteGlbPortable(once.bytes)

      expect(twice.isChanged).toBe(false)
      expect(twice.bytes).toBe(once.bytes)
    })

    it('refuses a file with a node it did not write', async () => {
      // The rewrite replaces `json.nodes` wholesale, so a node with no
      // `extras.bldrsTableNode` would be silently dropped. Refusing keeps the
      // failure mode "no portability" rather than "missing geometry".
      const {json, bin} = parseGlb(await artifactWithTree())
      json.nodes.push({name: 'A camera rig, say'})

      expect(isPortableRewritable(json)).toBe(false)
      expect(bin).toBeTruthy()
    })
  })

  describe('the node tree it emits (IFC, joined on parent expressID)', () => {
    let source
    let result
    let json

    beforeAll(async () => {
      source = await artifactWithTree({mutateModel: asIfcModel})
      result = rewriteGlbPortable(source)
      json = parseGlb(result.bytes).json
    })

    it('emits one node per spatial-tree node, and one per instance', () => {
      const tables = payloadOf(source, BLDRS_INSTANCE_TABLES_EXTENSION_NAME)
      const totalInstances = tables.nodes.reduce((n, node) => n + node.count, 0)
      // Non-vacuity: the fixture really does instance something more than once,
      // or "every instance emitted exactly once" would be a statement about
      // three nodes and three instances trivially.
      expect(tables.nodes.some((node) => node.count > 1)).toBe(true)

      expect(meshBearingNodes(json)).toHaveLength(totalInstances)
      expect(result.stats.elementNodes).toBe(IFC_TREE_NODE_COUNT)
      expect(result.stats.unassignedInstances).toBe(0)
    })

    it('names each node the way the NavTree names it', () => {
      // `reifyName` prefers LongName over Name…
      expect(nodeNamed(json, 'Level 1')).toBeTruthy()
      expect((json.nodes || []).some((node) => node.name === 'Ignored')).toBe(false)
      // …an authored Name is used as it stands…
      expect(nodeNamed(json, 'Wall A')).toBeTruthy()
      expect(nodeNamed(json, 'Slab')).toBeTruthy()
      expect(nodeNamed(json, 'Bldrs')).toBeTruthy()
      // …and an unnamed element gets its prettified type plus the expressID,
      // which is what keeps two unnamed walls apart.
      expect(nodeNamed(json, 'Wall #12')).toBeTruthy()
    })

    it('nests them to mirror the spatial tree', () => {
      const project = nodeNamed(json, 'Bldrs')
      const storey = nodeNamed(json, 'Level 1')
      expect(project.children.map((i) => json.nodes[i].name)).toEqual(['Level 1'])
      expect(storey.children.map((i) => json.nodes[i].name).sort())
        .toEqual(['Slab', 'Wall #12', 'Wall A'])
    })

    it('carries each instance TRS as the node transform', () => {
      // `liveBatchedModel` places its three instances at (1,0,0), (2,0,0) and
      // (0,3,0) with no rotation and no scale.
      expect(nodeNamed(json, 'Wall A').translation).toEqual([1, 0, 0])
      expect(nodeNamed(json, 'Wall #12').translation).toEqual([2, 0, 0])
      expect(nodeNamed(json, 'Slab').translation).toEqual([0, 3, 0])
      // Default components are omitted — glTF defines them, and repeating
      // `"scale":[1,1,1]` on every node of a 100k-instance model is 2 MB of
      // saying nothing.
      expect(nodeNamed(json, 'Wall A').rotation).toBeUndefined()
      expect(nodeNamed(json, 'Wall A').scale).toBeUndefined()
    })

    it('stamps the join keys a portable re-hydration needs', () => {
      // Without this pair a portable file is permanently un-hydratable: there
      // is no other way back from a plain Mesh to its row in
      // `BLDRS_instance_tables`. #1849 is the hydration itself.
      for (const node of meshBearingNodes(json)) {
        expect(Number.isInteger(node.extras.bldrsTableNode)).toBe(true)
        expect(Number.isInteger(node.extras.bldrsInstance)).toBe(true)
      }
      const stamps = meshBearingNodes(json)
        .map((node) => `${node.extras.bldrsTableNode}:${node.extras.bldrsInstance}`)
      expect(new Set(stamps).size).toBe(stamps.length)
    })

    it('drops EXT_mesh_gpu_instancing from both arrays and every node', () => {
      // `extensionsRequired` is the one that matters: the writer marks the
      // extension required, and a required extension a viewer does not
      // implement is a hard refusal, which is why 3dviewer.net would not open
      // the file at all (#1843).
      expect(parseGlb(source).json.extensionsRequired).toContain(INSTANCING_EXTENSION_NAME)
      expect(json.extensionsUsed || []).not.toContain(INSTANCING_EXTENSION_NAME)
      expect(json.extensionsRequired || []).not.toContain(INSTANCING_EXTENSION_NAME)
      for (const node of json.nodes) {
        expect(node.extensions?.[INSTANCING_EXTENSION_NAME]).toBeUndefined()
      }
    })

    it('keeps the geometry byte-identical, still shared between nodes', () => {
      expect(geometryBytesByMesh(result.bytes)).toEqual(geometryBytesByMesh(source))
      // The point of sharing: two elements placing the same part reference one
      // mesh, so the rewrite costs JSON and not vertices.
      expect(nodeNamed(json, 'Wall A').mesh).toBe(nodeNamed(json, 'Wall #12').mesh)
    })

    it('reclaims the orphaned instance-TRS accessors', () => {
      // Three float accessors per table node, 40 B per instance — 4 MB on a
      // 100k-instance model, and nothing downstream prunes them.
      const before = parseGlb(source).json
      expect(json.accessors.length).toBeLessThan(before.accessors.length)
      expect(json.bufferViews.length).toBeLessThan(before.bufferViews.length)
      expect(result.stats.droppedAccessors).toBe(before.accessors.length - json.accessors.length)
      expect(parseGlb(result.bytes).bin.byteLength).toBeLessThan(parseGlb(source).bin.byteLength)
    })

    it('leaves the Bldrs payloads readable', () => {
      // The nav tree and Properties hydrate from these and are indifferent to
      // the node graph, so a portable file still opens in Share with both.
      expect(payloadOf(result.bytes, BLDRS_SPATIAL_TREE_EXTENSION_NAME)).toEqual(IFC_TREE)
      expect(payloadOf(result.bytes, BLDRS_INSTANCE_TABLES_EXTENSION_NAME))
        .toEqual(payloadOf(source, BLDRS_INSTANCE_TABLES_EXTENSION_NAME))
    })
  })

  describe('STEP, joined on occurrence path', () => {
    it('separates two occurrences of one reused part', async () => {
      // `liveBatchedModel`'s first two instances share parent 11 and differ
      // only by `occurrencePath`. Joining on `parents` alone would put both
      // under one node and leave the other tree node empty — the same
      // "one nut highlights all" collision `design/new/step-occurrence-
      // selection.md` describes.
      const source = await artifactWithTree({
        tree: STEP_TREE,
        mutateModel: (model) => {
          model.instanceParents = [11, 11, 20]
        },
      })

      const {json} = parseGlb(rewriteGlbPortable(source).bytes)

      const nuts = json.nodes.filter((node) => node.name === 'Nut')
      expect(nuts).toHaveLength(2)
      expect(nuts.map((node) => node.translation)).toEqual([[1, 0, 0], [2, 0, 0]])
      expect(nuts.map((node) => node.extras.bldrsInstance)).toEqual([0, 1])
      expect(nodeNamed(json, 'Plate').translation).toEqual([0, 3, 0])
    })
  })

  describe('instances the tree does not account for', () => {
    it('parks them under one synthetic node rather than losing them', async () => {
      // A tree that names only the project: every placement is unmatched. They
      // are still geometry the user exported, so they must appear somewhere.
      const source = await artifactWithTree({
        tree: {expressID: 1, type: 'IFCPROJECT', Name: {value: 'Bldrs'}, children: []},
        mutateModel: asIfcModel,
      })

      const result = rewriteGlbPortable(source)
      const {json} = parseGlb(result.bytes)

      expect(result.stats.unassignedInstances).toBe(3)
      const unassigned = nodeNamed(json, UNASSIGNED_NODE_NAME)
      expect(unassigned.children).toHaveLength(3)
      expect(meshBearingNodes(json)).toHaveLength(3)
      // …and it is a scene root, not buried under the project it does not
      // belong to.
      expect(json.scenes[0].nodes).toContain(json.nodes.indexOf(unassigned))
    })

    it('still produces a portable file when the tree is missing entirely', async () => {
      const result = rewriteGlbPortable(await artifactWithTree({tree: null}))
      const {json} = parseGlb(result.bytes)

      // Losing the names is a smaller harm than losing the export: the
      // extension is still gone, which is what makes the file open at all.
      expect(result.isChanged).toBe(true)
      expect(json.extensionsRequired || []).not.toContain(INSTANCING_EXTENSION_NAME)
      expect(meshBearingNodes(json)).toHaveLength(3)
      expect(nodeNamed(json, UNASSIGNED_NODE_NAME)).toBeTruthy()
    })
  })

  describe('what a third-party viewer makes of it', () => {
    it('parses to the named, nested hierarchy three.js editor showed as mesh_N', async () => {
      const source = await artifactWithTree({mutateModel: asIfcModel})

      const hierarchy = await parseHierarchy(rewriteGlbPortable(source).bytes)

      // The acceptance claim of #1843, read off a real `GLTFLoader` parse
      // rather than off the JSON: project → storey → three named leaves, and
      // the leaves are the meshes.
      expect(hierarchy).toEqual(expect.arrayContaining([
        {name: 'Bldrs', parent: null, isMesh: false},
        {name: asThreeName('Level 1'), parent: 'Bldrs', isMesh: false},
        {name: asThreeName('Wall A'), parent: asThreeName('Level 1'), isMesh: true},
        {name: asThreeName('Wall #12'), parent: asThreeName('Level 1'), isMesh: true},
        {name: 'Slab', parent: asThreeName('Level 1'), isMesh: true},
      ]))
      expect(hierarchy.filter((entry) => entry.isMesh)).toHaveLength(3)
    })

    it('places every mesh where the instancing put it', async () => {
      // The transforms are the other half of "opens correctly": a viewer that
      // ignored them would draw all three parts at the origin.
      const portable = rewriteGlbPortable(await artifactWithTree({mutateModel: asIfcModel})).bytes
      const ab = new ArrayBuffer(portable.byteLength)
      new Uint8Array(ab).set(portable)
      const gltf = await new Promise((resolve, reject) => {
        new GLTFLoader().parse(ab, './', resolve, reject)
      })

      gltf.scenes[0].updateMatrixWorld(true)
      const positionOf = (name) => {
        const object = gltf.scenes[0].getObjectByName(asThreeName(name))
        return object.matrixWorld.elements.slice(12, 15)
      }
      expect(positionOf('Wall A')).toEqual([1, 0, 0])
      expect(positionOf('Wall #12')).toEqual([2, 0, 0])
      expect(positionOf('Slab')).toEqual([0, 3, 0])
    })
  })

  describe('portable, then a codec', () => {
    beforeAll(() => {
      installDracoEncoder()
    })

    it.each([
      [COMPRESSION_MESHOPT, 'EXT_meshopt_compression'],
      [COMPRESSION_DRACO, 'KHR_draco_mesh_compression'],
    ])('survives a %s encode with its names, extras and nesting intact', async (mode, extensionName) => {
      // `compressExportGlb` runs the file through `@gltf-transform`, which
      // rebuilds the whole document from its own object model. Whether node
      // `name`, `extras` and parentage come back out the other side is a
      // property of that library, and the planning pass for #1843 could not
      // settle it by reading — so it is pinned here.
      const source = await artifactWithTree({mutateModel: asIfcModel})
      const portable = rewriteGlbPortable(source)

      const compressed = await compressExportGlb(portable.bytes, mode)

      expect(compressed.mode).toBe(mode)
      const {json} = parseGlb(compressed.withMetadata)
      expect(json.extensionsUsed).toContain(extensionName)
      // Still portable: the codec must not reintroduce what the rewrite took
      // out, and the file must not have collapsed back to one node per bin.
      expect(json.extensionsUsed).not.toContain(INSTANCING_EXTENSION_NAME)
      expect(json.extensionsRequired || []).not.toContain(INSTANCING_EXTENSION_NAME)
      expect(nodeNamed(json, 'Wall A').extras).toEqual({bldrsTableNode: 0, bldrsInstance: 0})
      expect(nodeNamed(json, 'Bldrs').children.map((i) => json.nodes[i].name)).toEqual(['Level 1'])
      // …and the Bldrs payloads still came back, which is the half the
      // detach/re-attach dance around the transform exists for.
      expect(payloadOf(compressed.withMetadata, BLDRS_SPATIAL_TREE_EXTENSION_NAME)).toEqual(IFC_TREE)
    }, TIMEOUT_MS)
  })
})
