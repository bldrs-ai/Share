// The size line's arithmetic, on real bytes: a synthetic GLB carrying four
// bufferViews — one geometry, two that only `BLDRS_*` extensions reference,
// and one referenced by BOTH a Bldrs extension and a geometry accessor — is
// packed into a Bldrs container exactly as the writer packs one, and sized
// from its header alone.
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


/**
 * The cached artifact as OPFS holds it, wrapped for the size read.
 *
 * A `Blob`, not a `File`: OPFS hands the app a real browser File, but jsdom's
 * File under jest has no `arrayBuffer()` on what `slice()` returns. Only
 * `size`/`slice`/`arrayBuffer` are used here, and a Blob has all three.
 *
 * @param {object} [json]
 * @return {{file: Blob, glb: Uint8Array}}
 */
function cachedArtifact(json = glbJson()) {
  const glb = serializeGlb(json, bin())
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
