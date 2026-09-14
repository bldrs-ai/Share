// The size line's arithmetic, on real bytes: a synthetic GLB carrying four
// bufferViews — one geometry, two that only `BLDRS_*` extensions reference,
// and one referenced by BOTH a Bldrs extension and a geometry accessor — is
// packed into a Bldrs container exactly as the writer packs one, and sized
// from its header alone.
//
// Two more documents cover the compressed artifacts `glbCompress.js` writes
// under `?feature=glbMeshopt` / `?feature=glbDraco`, where "which bytes does
// this view own" stops being obvious: `meshoptGlbJson` and `dracoGlbJson`.
//
// The cross-check that the number equals what the exporter actually writes
// lives in `src/export/pro/glbExport.test.js`, because the eslint fence
// stops anything under `src/` outside that directory from importing it.
import {
  artifactSizesFromFile,
  classifyBldrsBufferViews,
  estimateStrippedGlbSize,
  glbByteLength,
  glbJsonChunkBytes,
  stripBldrsJson,
} from './glbArtifactSize'
import {packGlbChunks} from './glbContainer'
import {serializeGlb} from './injectGlbExtensions'


/* eslint-disable no-magic-numbers */
// One fill byte per view, so a view that moved can be told from one that was
// merely the right length.
const GEOMETRY = {fill: 0x11, byteOffset: 0, byteLength: 16}
const SPATIAL_TREE = {fill: 0x22, byteOffset: 16, byteLength: 12}
const SHARED = {fill: 0x33, byteOffset: 28, byteLength: 6}
const ELEMENT_PROPERTIES = {fill: 0x44, byteOffset: 36, byteLength: 20}
const BIN_BYTES = 56


/**
 * The artifact's BIN chunk: the four views at their 4-aligned offsets.
 *
 * @return {Uint8Array}
 */
function bin() {
  const out = new Uint8Array(BIN_BYTES)
  for (const view of [GEOMETRY, SPATIAL_TREE, SHARED, ELEMENT_PROPERTIES]) {
    out.fill(view.fill, view.byteOffset, view.byteOffset + view.byteLength)
  }
  return out
}


/**
 * A glTF document shaped like the batched-native artifact: Bldrs payloads in
 * their own views, geometry in accessors, and one view both sides reference.
 *
 * @return {object}
 */
function glbJson() {
  return {
    asset: {version: '2.0', generator: 'bldrs-test'},
    extensionsUsed: [
      'BLDRS_spatial_tree', 'BLDRS_element_properties', 'BLDRS_face_ids', 'EXT_mesh_gpu_instancing',
    ],
    extensions: {
      BLDRS_spatial_tree: {compressed: true, bufferView: 1},
      // Shares view 2 with the `_EXPRESSID` accessor below.
      BLDRS_face_ids: {compressed: true, bufferView: 2},
      BLDRS_element_properties: {compressed: true, bufferView: 3},
    },
    accessors: [
      {bufferView: 0, componentType: 5126, count: 4, type: 'VEC3'},
      {bufferView: 2, componentType: 5121, count: 6, type: 'SCALAR'},
    ],
    meshes: [{primitives: [{attributes: {POSITION: 0, _EXPRESSID: 1}}]}],
    nodes: [{mesh: 0, extensions: {EXT_mesh_gpu_instancing: {attributes: {}}}}],
    scene: 0,
    scenes: [{nodes: [0]}],
    buffers: [{byteLength: BIN_BYTES}],
    bufferViews: [GEOMETRY, SPATIAL_TREE, SHARED, ELEMENT_PROPERTIES].map((v) => ({
      buffer: 0, byteOffset: v.byteOffset, byteLength: v.byteLength,
    })),
  }
}


/**
 * A glTF document with nothing of ours in it — a GLB some other exporter
 * could have written.
 *
 * @return {object}
 */
function plainGlbJson() {
  const json = glbJson()
  delete json.extensions
  json.extensionsUsed = ['EXT_mesh_gpu_instancing']
  return json
}


// A Meshopt artifact's BIN chunk, laid out the way `@gltf-transform`'s
// `meshopt()` leaves one (`glbCompress.js`) with a Bldrs payload dropped in
// between: two COMPRESSED ranges that only `extensions.EXT_meshopt_compression`
// names, and one ordinary Bldrs view. The gap between the payload and the
// second compressed range is there so a plan that merely kept offsets, rather
// than re-laying them, would be visible.
const MESHOPT_A = {fill: 0xa1, byteOffset: 0, byteLength: 22, decodedLength: 96}
const MESHOPT_PAYLOAD = {fill: 0xb2, byteOffset: 24, byteLength: 12}
const MESHOPT_B = {fill: 0xc3, byteOffset: 40, byteLength: 14, decodedLength: 48}
const MESHOPT_BIN_BYTES = 56
const MESHOPT_FALLBACK_BYTES = MESHOPT_A.decodedLength + MESHOPT_B.decodedLength


/**
 * A Meshopt-compressed glTF document carrying one Bldrs payload.
 *
 * The shape is `@gltf-transform/extensions` v4.3.0's, read off its actual
 * output rather than off the spec: the compressed views live on `buffers[1]`
 * — the fallback buffer, no URI and no bytes in the file — while their real
 * bytes sit in the BIN chunk at the offsets their extension names.
 * `export/pro/glbExport.meshopt.test.js` re-checks that against the live
 * encoder, so this fixture cannot quietly drift into describing fiction.
 *
 * @return {object}
 */
function meshoptGlbJson() {
  return {
    asset: {version: '2.0', generator: 'bldrs-test'},
    extensionsUsed: ['BLDRS_element_properties', 'EXT_meshopt_compression'],
    extensionsRequired: ['EXT_meshopt_compression'],
    extensions: {BLDRS_element_properties: {compressed: true, bufferView: 1}},
    accessors: [
      {bufferView: 0, componentType: 5126, count: 8, type: 'VEC3'},
      {bufferView: 2, componentType: 5123, count: 24, type: 'SCALAR'},
    ],
    meshes: [{primitives: [{attributes: {POSITION: 0}, indices: 1}]}],
    nodes: [{mesh: 0}],
    scene: 0,
    scenes: [{nodes: [0]}],
    buffers: [
      {byteLength: MESHOPT_BIN_BYTES},
      {byteLength: MESHOPT_FALLBACK_BYTES, extensions: {EXT_meshopt_compression: {fallback: true}}},
    ],
    bufferViews: [
      meshoptView(MESHOPT_A, 'ATTRIBUTES', 0),
      {buffer: 0, byteOffset: MESHOPT_PAYLOAD.byteOffset, byteLength: MESHOPT_PAYLOAD.byteLength},
      meshoptView(MESHOPT_B, 'TRIANGLES', MESHOPT_A.decodedLength),
    ],
  }
}


/**
 * One `EXT_meshopt_compression` bufferView: decoded fields on the fallback
 * buffer, compressed range in the BIN chunk.
 *
 * @param {object} range One of the MESHOPT_* constants
 * @param {string} mode Meshopt filter mode
 * @param {number} decodedOffset This view's offset on the fallback buffer
 * @return {object} a bufferView entry
 */
function meshoptView(range, mode, decodedOffset) {
  return {
    buffer: 1,
    byteOffset: decodedOffset,
    byteLength: range.decodedLength,
    extensions: {
      EXT_meshopt_compression: {
        buffer: 0,
        byteOffset: range.byteOffset,
        byteLength: range.byteLength,
        mode,
        byteStride: 12,
        count: 8,
      },
    },
  }
}


/**
 * The BIN chunk `meshoptGlbJson` describes.
 *
 * @return {Uint8Array}
 */
function meshoptBin() {
  const out = new Uint8Array(MESHOPT_BIN_BYTES)
  for (const range of [MESHOPT_A, MESHOPT_PAYLOAD, MESHOPT_B]) {
    out.fill(range.fill, range.byteOffset, range.byteOffset + range.byteLength)
  }
  return out
}


/**
 * A DRACO-compressed document: the geometry is a bufferView the primitive's
 * `KHR_draco_mesh_compression` names (the accessors have no `bufferView` of
 * their own), beside one Bldrs payload view.
 *
 * @return {object}
 */
function dracoGlbJson() {
  return {
    asset: {version: '2.0', generator: 'bldrs-test'},
    extensionsUsed: ['BLDRS_element_properties', 'KHR_draco_mesh_compression'],
    extensionsRequired: ['KHR_draco_mesh_compression'],
    extensions: {BLDRS_element_properties: {compressed: true, bufferView: 0}},
    accessors: [{componentType: 5126, count: 8, type: 'VEC3'}],
    meshes: [{
      primitives: [{
        attributes: {POSITION: 0},
        extensions: {KHR_draco_mesh_compression: {bufferView: 1, attributes: {POSITION: 0}}},
      }],
    }],
    nodes: [{mesh: 0}],
    scene: 0,
    scenes: [{nodes: [0]}],
    buffers: [{byteLength: 56}],
    bufferViews: [
      {buffer: 0, byteOffset: 0, byteLength: 12},
      {buffer: 0, byteOffset: 16, byteLength: 20},
    ],
  }
}


/**
 * The cached artifact as OPFS holds it, wrapped for the size read.
 *
 * A `Blob`, not a `File`: OPFS hands the app a real browser File, but jsdom's
 * File under jest has no `arrayBuffer()` on what `slice()` returns. Only
 * `size`/`slice`/`arrayBuffer` are used here, and a Blob has all three.
 *
 * @param {object} [json]
 * @param {Uint8Array} [binBytes] The BIN chunk that JSON describes
 * @return {{file: Blob, glb: Uint8Array}}
 */
function cachedArtifact(json = glbJson(), binBytes = bin()) {
  const glb = serializeGlb(json, binBytes)
  return {file: new Blob([packGlbChunks([glb])]), glb}
}


describe('glbArtifactSize', () => {
  describe('classifyBldrsBufferViews', () => {
    it('names the views only a BLDRS_ extension reaches', () => {
      expect([...classifyBldrsBufferViews(glbJson())].sort()).toEqual([1, 3])
    })

    it('keeps a view a geometry accessor shares with a Bldrs extension', () => {
      // View 2 is `BLDRS_face_ids`' payload AND the `_EXPRESSID` accessor's
      // data. Dropping it would take the geometry with the metadata — the
      // one way this feature can corrupt a model rather than shrink it.
      expect(classifyBldrsBufferViews(glbJson()).has(2)).toBe(false)
    })

    it('counts a reference it has never seen the shape of as non-Bldrs', () => {
      // An unknown extension referencing a view keeps that view: the walk is
      // generic so a future exporter's reference kind is safe by default.
      const json = glbJson()
      json.extensions.EXT_future_thing = {bufferView: 1}
      expect([...classifyBldrsBufferViews(json)]).toEqual([3])
    })
  })

  describe('stripBldrsJson', () => {
    it('drops the Bldrs-only views and re-indexes what is left', () => {
      const json = glbJson()

      const {strippedExtensions, droppedBufferViews, binByteLength, isChanged} = stripBldrsJson(json)

      expect(isChanged).toBe(true)
      expect(strippedExtensions).toEqual(
        ['BLDRS_element_properties', 'BLDRS_face_ids', 'BLDRS_spatial_tree'])
      expect(droppedBufferViews).toEqual([1, 3])
      expect(json.bufferViews).toEqual([
        {buffer: 0, byteOffset: 0, byteLength: GEOMETRY.byteLength},
        {buffer: 0, byteOffset: 16, byteLength: SHARED.byteLength},
      ])
      // The accessors now point at the compacted table, not at the holes.
      expect(json.accessors.map((a) => a.bufferView)).toEqual([0, 1])
      expect(json.extensions).toBeUndefined()
      expect(json.extensionsUsed).toEqual(['EXT_mesh_gpu_instancing'])
      expect(binByteLength).toBe(GEOMETRY.byteLength + SHARED.byteLength)
      expect(json.buffers[0].byteLength).toBe(binByteLength)
    })

    it('hands back the recipe for the compacted BIN chunk', () => {
      const {binPlan} = stripBldrsJson(glbJson())

      expect(binPlan).toEqual([
        {fromOffset: 0, byteLength: 16, toOffset: 0},
        {fromOffset: 28, byteLength: 6, toOffset: 16},
      ])
    })

    it('reports a GLB with no Bldrs data as unchanged', () => {
      // `isChanged: false` is the caller's signal to hand over its input
      // untouched rather than re-serialise a file it changed nothing in.
      expect(stripBldrsJson(plainGlbJson()).isChanged).toBe(false)
    })
  })

  describe('estimateStrippedGlbSize', () => {
    it('is the length the same JSON serialises to, not an approximation', () => {
      const json = glbJson()
      const jsonByteLength = glbJsonChunkBytes(json).byteLength

      const estimate = estimateStrippedGlbSize(json, BIN_BYTES, jsonByteLength)

      // `json` came back stripped, so serialising it here — with a BIN
      // chunk of the compacted length the strip computed — is the very file
      // the exporter produces: same document, same `JSON.stringify`.
      const strippedBin = new Uint8Array(json.buffers[0].byteLength)
      expect(serializeGlb(json, strippedBin).byteLength).toBe(estimate)
    })

    it('leaves a GLB with no Bldrs data at its original size', () => {
      const json = plainGlbJson()
      const glb = serializeGlb(json, bin())
      const jsonByteLength = glbJsonChunkBytes(json).byteLength

      expect(estimateStrippedGlbSize(json, BIN_BYTES, jsonByteLength)).toBe(glb.byteLength)
    })
  })

  describe('EXT_meshopt_compression', () => {
    // A Meshopt view's `buffer: 1` used to read as "external, nothing of ours
    // in the BIN chunk", so the plan came back EMPTY and the repack wrote a
    // GLB whose required Meshopt references pointed at bytes that were no
    // longer there — unopenable, not merely bigger (#1841).
    it('lays the compressed ranges out in the BIN chunk, gaps reclaimed', () => {
      const json = meshoptGlbJson()

      const {droppedBufferViews, binPlan, binByteLength} = stripBldrsJson(json)

      expect(droppedBufferViews).toEqual([1])
      expect(binPlan).toEqual([
        {fromOffset: MESHOPT_A.byteOffset, byteLength: MESHOPT_A.byteLength, toOffset: 0},
        {fromOffset: MESHOPT_B.byteOffset, byteLength: MESHOPT_B.byteLength, toOffset: 24},
      ])
      // 20B padded to 24, then 14B: the payload's 12B and the 4B hole after
      // it are what the strip reclaimed.
      expect(binByteLength).toBe(38)
      expect(json.buffers[0].byteLength).toBe(38)
    })

    it('re-offsets the extension, not the view it hangs off', () => {
      const json = meshoptGlbJson()

      stripBldrsJson(json)

      const [first, second] = json.bufferViews
      expect(first.extensions.EXT_meshopt_compression).toMatchObject(
        {buffer: 0, byteOffset: 0, byteLength: MESHOPT_A.byteLength})
      expect(second.extensions.EXT_meshopt_compression).toMatchObject(
        {buffer: 0, byteOffset: 24, byteLength: MESHOPT_B.byteLength})
      // The decoded side addresses the fallback buffer, which carries no
      // bytes in the file and is not being re-laid: touching it would tell
      // the decoder to write its output somewhere it was not asked to.
      expect(first).toMatchObject({buffer: 1, byteOffset: 0, byteLength: MESHOPT_A.decodedLength})
      expect(second).toMatchObject(
        {buffer: 1, byteOffset: MESHOPT_A.decodedLength, byteLength: MESHOPT_B.decodedLength})
      expect(json.buffers[1]).toEqual({
        byteLength: MESHOPT_FALLBACK_BYTES,
        extensions: {EXT_meshopt_compression: {fallback: true}},
      })
    })

    it('keeps the extension required and re-indexes the accessors', () => {
      const json = meshoptGlbJson()

      stripBldrsJson(json)

      expect(json.extensionsRequired).toEqual(['EXT_meshopt_compression'])
      expect(json.extensionsUsed).toEqual(['EXT_meshopt_compression'])
      expect(json.extensions).toBeUndefined()
      expect(json.accessors.map((a) => a.bufferView)).toEqual([0, 1])
    })

    it('sizes a Meshopt artifact exactly, same as any other', () => {
      const json = meshoptGlbJson()
      const jsonByteLength = glbJsonChunkBytes(json).byteLength

      const estimate = estimateStrippedGlbSize(json, MESHOPT_BIN_BYTES, jsonByteLength)

      expect(serializeGlb(json, new Uint8Array(json.buffers[0].byteLength)).byteLength).toBe(estimate)
      expect(estimate).toBeLessThan(serializeGlb(meshoptGlbJson(), meshoptBin()).byteLength)
    })

    it('still treats a view on a genuinely external buffer as costing nothing', () => {
      // No `EXT_meshopt_compression` on it: `buffer: 1` then means what it
      // has always meant — bytes this file does not carry.
      const json = meshoptGlbJson()
      delete json.bufferViews[2].extensions

      const {binPlan, binByteLength} = stripBldrsJson(json)

      expect(binPlan).toEqual([{fromOffset: 0, byteLength: MESHOPT_A.byteLength, toOffset: 0}])
      expect(binByteLength).toBe(MESHOPT_A.byteLength)
      expect(json.bufferViews[1]).toEqual(
        {buffer: 1, byteOffset: MESHOPT_A.decodedLength, byteLength: MESHOPT_B.decodedLength})
    })

    it('drops a compressed range whose view only the metadata reached', () => {
      // Not something our writer emits, but the classification must carry the
      // extension's bytes out with the view rather than leave them stranded.
      const json = meshoptGlbJson()
      json.extensions.BLDRS_element_properties.bufferView = 2
      json.accessors[1].bufferView = 0

      const {droppedBufferViews, binPlan, binByteLength} = stripBldrsJson(json)

      expect(droppedBufferViews).toEqual([2])
      expect(binPlan).toEqual([
        {fromOffset: MESHOPT_A.byteOffset, byteLength: MESHOPT_A.byteLength, toOffset: 0},
        {fromOffset: MESHOPT_PAYLOAD.byteOffset, byteLength: MESHOPT_PAYLOAD.byteLength, toOffset: 24},
      ])
      expect(binByteLength).toBe(36)
    })
  })

  describe('KHR_draco_mesh_compression', () => {
    it('keeps the compressed view and moves it with the rest', () => {
      // DRACO puts its payload in an ordinary bufferView the primitive's
      // extension names, so the generic walk already sees the reference —
      // this pins that, since the accessors carry no `bufferView` to fall
      // back on and a dropped view here is a mesh that never arrives.
      const json = dracoGlbJson()

      const {droppedBufferViews, binPlan, binByteLength} = stripBldrsJson(json)

      expect(droppedBufferViews).toEqual([0])
      expect(binPlan).toEqual([{fromOffset: 16, byteLength: 20, toOffset: 0}])
      expect(binByteLength).toBe(20)
      expect(json.bufferViews).toEqual([{buffer: 0, byteOffset: 0, byteLength: 20}])
      expect(json.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression)
        .toEqual({bufferView: 0, attributes: {POSITION: 0}})
      expect(json.extensionsRequired).toEqual(['KHR_draco_mesh_compression'])
    })
  })

  describe('glbByteLength', () => {
    it('pads both chunks to 4 and counts their headers', () => {
      // 12B file header + 8B chunk header + JSON padded + 8B + BIN padded.
      expect(glbByteLength(5, 6)).toBe(12 + 8 + 8 + 8 + 8)
    })

    it('writes no BIN chunk at all for an empty buffer', () => {
      expect(glbByteLength(4, 0)).toBe(12 + 8 + 4)
    })
  })

  describe('artifactSizesFromFile', () => {
    it('reports both sizes from the header, without reading the BIN chunk', async () => {
      const {file, glb} = cachedArtifact()
      const readRanges = []
      const slice = file.slice.bind(file)
      jest.spyOn(file, 'slice').mockImplementation((start, end) => {
        readRanges.push([start, end])
        return slice(start, end)
      })

      const sizes = await artifactSizesFromFile(file)

      expect(sizes.withMetadata).toBe(glb.byteLength)
      expect(sizes.withoutMetadata).toBeLessThan(sizes.withMetadata)
      expect(sizes.metadataBytes).toBe(sizes.withMetadata - sizes.withoutMetadata)
      // Nothing read past the JSON chunk: the BIN chunk is all of the size
      // and none of the information, and on a 400MB model reading it is the
      // difference between a number and a stall.
      const binStart = file.size - BIN_BYTES
      for (const [, end] of readRanges) {
        expect(end).toBeLessThanOrEqual(binStart)
      }
    })

    it('reports no saving for a GLB that carries no Bldrs data', async () => {
      const {file, glb} = cachedArtifact(plainGlbJson())

      const sizes = await artifactSizesFromFile(file)

      expect(sizes.withMetadata).toBe(glb.byteLength)
      expect(sizes.withoutMetadata).toBe(glb.byteLength)
      expect(sizes.metadataBytes).toBe(0)
    })

    it('sizes a Meshopt artifact from its header too', async () => {
      // Two buffers, and the only bytes in the file belong to an extension
      // rather than to the views themselves — the shape the header-only read
      // has the least to go on.
      const {file, glb} = cachedArtifact(meshoptGlbJson(), meshoptBin())
      const stripped = meshoptGlbJson()
      stripBldrsJson(stripped)
      const written = serializeGlb(stripped, new Uint8Array(stripped.buffers[0].byteLength))

      const sizes = await artifactSizesFromFile(file)

      expect(sizes.withMetadata).toBe(glb.byteLength)
      expect(sizes.withoutMetadata).toBe(written.byteLength)
    })

    it('refuses a multi-chunk container rather than sizing a fraction of it', async () => {
      const glb = serializeGlb(glbJson(), bin())
      const file = new Blob([packGlbChunks([glb, glb])])

      await expect(artifactSizesFromFile(file)).rejects.toThrow(/expected 1 chunk/)
    })

    it('rejects a file that is not a container at all', async () => {
      await expect(artifactSizesFromFile(new Blob([new Uint8Array(64)])))
        .rejects.toThrow(/BLDR magic/)
    })
  })
})
