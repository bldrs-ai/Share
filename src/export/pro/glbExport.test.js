// Tests for the GLB pro module, on REAL bytes: a tiny but well-formed GLB
// carrying both Bldrs-private and ratified extensions is packed into a Bldrs
// container exactly as `glbExport.js` (the writer) would, then exported.
// Nothing here is mocked — the whole point of the module is what comes out
// the other end, byte for byte.
import {artifactSizesFromFile} from '../../loader/glbArtifactSize'
import {packGlbChunks} from '../../loader/glbContainer'
import {parseGlb, serializeGlb} from '../../loader/injectGlbExtensions'
import {exportArtifact, exportFilename, format} from './glbExport'


/* eslint-disable no-magic-numbers */
// The BIN chunk as the writer lays it out: the geometry a standard accessor
// reads, then one Bldrs payload's gzipped bytes in a view of its own — the
// pair the strip has to tell apart.
const GEOMETRY_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
const METADATA_BYTES = new Uint8Array(12).fill(0x55)
const BIN = new Uint8Array(GEOMETRY_BYTES.byteLength + METADATA_BYTES.byteLength)
BIN.set(GEOMETRY_BYTES, 0)
BIN.set(METADATA_BYTES, GEOMETRY_BYTES.byteLength)
const GLTF_MAGIC = 'glTF'
const ALIGNMENT = 4


/**
 * A minimal glTF JSON with every extension holder this module edits:
 * root, node, mesh, primitive, scene — each carrying one Bldrs-private
 * extension beside a ratified Khronos one that must survive.
 *
 * @return {object} glTF JSON
 */
function glbJson() {
  return {
    asset: {version: '2.0', generator: 'bldrs-test'},
    extensionsUsed: ['BLDRS_spatial_tree', 'BLDRS_element_properties', 'EXT_mesh_gpu_instancing'],
    extensions: {
      BLDRS_spatial_tree: {compressed: true, bufferView: 1},
      BLDRS_element_properties: {compressed: true, bufferView: 1},
    },
    scene: 0,
    scenes: [{nodes: [0], extras: {bldrsTitle: 'Momentum'}, extensions: {BLDRS_view_states: {}}}],
    nodes: [{mesh: 0, extensions: {BLDRS_instance_tables: {}, EXT_mesh_gpu_instancing: {attributes: {}}}}],
    meshes: [{primitives: [{attributes: {POSITION: 0}, extensions: {BLDRS_face_ids: {bufferView: 1}}}]}],
    accessors: [{bufferView: 0, componentType: 5121, count: 8, type: 'SCALAR'}],
    buffers: [{byteLength: BIN.byteLength}],
    bufferViews: [
      {buffer: 0, byteOffset: 0, byteLength: GEOMETRY_BYTES.byteLength},
      {buffer: 0, byteOffset: GEOMETRY_BYTES.byteLength, byteLength: METADATA_BYTES.byteLength},
    ],
  }
}


// The compressed artifacts `glbCompress.js` writes under `?feature=glbMeshopt`
// / `?feature=glbDraco`. Meshopt is the awkward one: a compressed bufferView's
// own `buffer`/`byteOffset` address the DECODED bytes on a fallback buffer the
// file does not carry, and the bytes that ARE in the BIN chunk are the ones
// `extensions.EXT_meshopt_compression` names. Distinct byte values per range so
// "the right bytes landed" is a stronger claim than "the right number of them".
const MESHOPT_A_BYTES = Uint8Array.from({length: 22}, (v, i) => 0x40 + i)
const MESHOPT_PAYLOAD_BYTES = new Uint8Array(12).fill(0xee)
const MESHOPT_B_BYTES = Uint8Array.from({length: 14}, (v, i) => 0x80 + i)
const MESHOPT_A_AT = 0
const MESHOPT_PAYLOAD_AT = 24
// A hole at 36..40 the strip should reclaim along with the payload.
const MESHOPT_B_AT = 40
const MESHOPT_BIN_BYTES = 56
const MESHOPT_DECODED_A = 96
const MESHOPT_DECODED_B = 48
const DRACO_PAYLOAD_BYTES = new Uint8Array(12).fill(0x66)
const DRACO_BYTES = Uint8Array.from({length: 20}, (v, i) => 0xc0 + i)
const DRACO_AT = 16
const DRACO_BIN_BYTES = 40


/**
 * A Meshopt artifact's BIN chunk: two compressed ranges with a Bldrs payload
 * between them.
 *
 * @return {Uint8Array}
 */
function meshoptBin() {
  const out = new Uint8Array(MESHOPT_BIN_BYTES)
  out.set(MESHOPT_A_BYTES, MESHOPT_A_AT)
  out.set(MESHOPT_PAYLOAD_BYTES, MESHOPT_PAYLOAD_AT)
  out.set(MESHOPT_B_BYTES, MESHOPT_B_AT)
  return out
}


/**
 * The glTF for that BIN chunk, shaped as `@gltf-transform/extensions` v4.3.0
 * emits one (`glbExport.meshopt.test.js` checks that claim against the real
 * encoder).
 *
 * @return {object} glTF JSON
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
      {
        byteLength: MESHOPT_DECODED_A + MESHOPT_DECODED_B,
        extensions: {EXT_meshopt_compression: {fallback: true}},
      },
    ],
    bufferViews: [
      {
        buffer: 1, byteOffset: 0, byteLength: MESHOPT_DECODED_A,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0, byteOffset: MESHOPT_A_AT, byteLength: MESHOPT_A_BYTES.byteLength,
            mode: 'ATTRIBUTES', byteStride: 12, count: 8,
          },
        },
      },
      {buffer: 0, byteOffset: MESHOPT_PAYLOAD_AT, byteLength: MESHOPT_PAYLOAD_BYTES.byteLength},
      {
        buffer: 1, byteOffset: MESHOPT_DECODED_A, byteLength: MESHOPT_DECODED_B,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0, byteOffset: MESHOPT_B_AT, byteLength: MESHOPT_B_BYTES.byteLength,
            mode: 'TRIANGLES', byteStride: 2, count: 24,
          },
        },
      },
    ],
  }
}


/**
 * A DRACO artifact's BIN chunk: one Bldrs payload, then the encoded mesh.
 *
 * @return {Uint8Array}
 */
function dracoBin() {
  const out = new Uint8Array(DRACO_BIN_BYTES)
  out.set(DRACO_PAYLOAD_BYTES, 0)
  out.set(DRACO_BYTES, DRACO_AT)
  return out
}


/**
 * The glTF for that BIN chunk. DRACO's payload is an ordinary bufferView the
 * primitive's extension names — the accessors have none of their own.
 *
 * @return {object} glTF JSON
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
    buffers: [{byteLength: DRACO_BIN_BYTES}],
    bufferViews: [
      {buffer: 0, byteOffset: 0, byteLength: DRACO_PAYLOAD_BYTES.byteLength},
      {buffer: 0, byteOffset: DRACO_AT, byteLength: DRACO_BYTES.byteLength},
    ],
  }
}


/**
 * The cached artifact as OPFS holds it: one GLB chunk inside a Bldrs
 * container (glbContainer.js), which is what the writer always packs.
 *
 * @param {object} [json]
 * @param {Uint8Array} [binBytes] The BIN chunk that JSON describes
 * @return {{container: Uint8Array, glb: Uint8Array}}
 */
function cachedArtifact(json = glbJson(), binBytes = BIN) {
  const glb = serializeGlb(json, binBytes)
  return {container: packGlbChunks([glb]), glb}
}


/**
 * @param {Blob} blob
 * @return {Promise<Uint8Array>}
 */
async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer())
}


/**
 * @param {Uint8Array} bytes
 * @return {string} the first four bytes as ASCII
 */
function magic(bytes) {
  return String.fromCharCode(...bytes.subarray(0, ALIGNMENT))
}


describe('pro/glbExport', () => {
  it('declares the format the registry and the download name are built from', () => {
    expect(format).toEqual({id: 'glb', ext: 'glb', mime: 'model/gltf-binary'})
  })

  describe('without stripping (the default)', () => {
    it('hands over chunk 0 byte-for-byte', async () => {
      // The container's single chunk IS a standalone GLB, so the default
      // export must be a copy and not a re-serialisation: anything else
      // risks changing the user's file for no reason.
      const {container, glb} = cachedArtifact()

      const {blob, stats} = exportArtifact({bytes: container, options: {}})
      const out = await blobBytes(blob)

      expect(magic(out)).toBe(GLTF_MAGIC)
      expect(out).toEqual(glb)
      expect(blob.type).toBe('model/gltf-binary')
      expect(stats.inputBytes).toBe(container.byteLength)
      expect(stats.outputBytes).toBe(glb.byteLength)
      expect(stats.strippedExtensions).toEqual([])
      // Both sizes are reported whichever way the toggle went, so the run
      // that KEPT the metadata still says what it was carrying.
      expect(stats.withMetadataBytes).toBe(glb.byteLength)
      expect(stats.withoutMetadataBytes).toBeLessThan(glb.byteLength)
      expect(stats.metadataBytes).toBe(glb.byteLength - stats.withoutMetadataBytes)
    })

    it('accepts the artifact as an ArrayBuffer too', async () => {
      const {container, glb} = cachedArtifact()
      const asArrayBuffer = container.slice().buffer

      const out = await blobBytes(exportArtifact({bytes: asArrayBuffer, options: {}}).blob)

      expect(out).toEqual(glb)
    })
  })

  describe('with stripBldrsMetadata', () => {
    /**
     * @return {Promise<{json: object, bin: Uint8Array, stats: object, bytes: Uint8Array}>}
     */
    async function exportStripped() {
      const {container} = cachedArtifact()
      const {blob, stats} = exportArtifact({bytes: container, options: {stripBldrsMetadata: true}})
      const bytes = await blobBytes(blob)
      const {json, bin} = parseGlb(bytes)
      return {json, bin, stats, bytes}
    }

    it('removes every BLDRS_ key and nothing else', async () => {
      const {json, stats} = await exportStripped()

      expect(json.extensions).toBeUndefined()
      expect(json.extensionsUsed).toEqual(['EXT_mesh_gpu_instancing'])
      // The batched-native layout's geometry IS EXT_mesh_gpu_instancing —
      // stripping it would hand the user an empty scene.
      expect(json.nodes[0].extensions).toEqual({EXT_mesh_gpu_instancing: {attributes: {}}})
      expect(json.meshes[0].primitives[0].extensions).toBeUndefined()
      expect(json.scenes[0].extensions).toBeUndefined()
      expect(stats.strippedExtensions).toEqual([
        'BLDRS_element_properties',
        'BLDRS_face_ids',
        'BLDRS_instance_tables',
        'BLDRS_spatial_tree',
        'BLDRS_view_states',
      ])
      // A grep over the whole file, which is how §8's smoke check reads it.
      expect(JSON.stringify(json)).not.toContain('BLDRS_')
    })

    it('leaves geometry and the standard scene fields intact', async () => {
      const {json, bin} = await exportStripped()

      expect(json.asset.version).toBe('2.0')
      expect(json.meshes[0].primitives[0].attributes).toEqual({POSITION: 0})
      expect(json.scenes[0].extras).toEqual({bldrsTitle: 'Momentum'})
      // The geometry's bytes, and only those: the metadata payload's view
      // left with the extension that owned it, and the survivor was moved
      // to the front of a compacted BIN chunk.
      expect(bin).toEqual(GEOMETRY_BYTES)
    })

    it('drops the bufferViews only the metadata referenced, bytes and all', async () => {
      // Through v0.1 the JSON entries went and their payloads stayed, so the
      // toggle barely moved the file size (#1841).
      const {json, bin, stats} = await exportStripped()

      expect(json.bufferViews).toEqual([
        {buffer: 0, byteOffset: 0, byteLength: GEOMETRY_BYTES.byteLength},
      ])
      expect(json.buffers[0].byteLength).toBe(GEOMETRY_BYTES.byteLength)
      expect(json.accessors[0].bufferView).toBe(0)
      expect(bin.byteLength).toBe(GEOMETRY_BYTES.byteLength)
      expect(stats.withMetadataBytes - stats.withoutMetadataBytes)
        .toBeGreaterThanOrEqual(METADATA_BYTES.byteLength)
    })

    it('keeps a view the geometry shares with a Bldrs extension', async () => {
      // `BLDRS_face_ids` reading the same block as a geometry accessor is
      // the case where "drop what the metadata referenced" would take the
      // model with it — a corrupt export, not a smaller one.
      const shared = glbJson()
      shared.meshes[0].primitives[0].extensions.BLDRS_face_ids = {bufferView: 0}
      const {container} = cachedArtifact(shared)

      const {blob} = exportArtifact({bytes: container, options: {stripBldrsMetadata: true}})
      const {json, bin} = parseGlb(await blobBytes(blob))

      expect(json.bufferViews).toHaveLength(1)
      expect(json.accessors[0].bufferView).toBe(0)
      expect(bin).toEqual(GEOMETRY_BYTES)
    })

    it('writes exactly the size the panel promised before the click', async () => {
      // The Export tab shows both figures from the artifact's HEADER, without
      // the pro module and without reading the BIN chunk
      // (`loader/glbArtifactSize.js`). They are the same computation, and
      // this is where that stops being a claim: estimate against real output.
      const {container} = cachedArtifact()
      const sizes = await artifactSizesFromFile(new Blob([container]))

      const kept = exportArtifact({bytes: container, options: {}})
      const stripped = exportArtifact({bytes: container, options: {stripBldrsMetadata: true}})

      expect(sizes.withMetadata).toBe(kept.blob.size)
      expect(sizes.withoutMetadata).toBe(stripped.blob.size)
      expect(sizes.metadataBytes).toBe(kept.blob.size - stripped.blob.size)
      // …and the same numbers reach the snackbar through `stats`.
      expect(stripped.stats.withoutMetadataBytes).toBe(sizes.withoutMetadata)
      expect(kept.stats.withoutMetadataBytes).toBe(sizes.withoutMetadata)
    })

    it('repacks a valid GLB — magic, 4-byte chunk padding, honest total length', async () => {
      const {bytes} = await exportStripped()
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

      expect(magic(bytes)).toBe(GLTF_MAGIC)
      expect(dv.getUint32(4, true)).toBe(2)
      expect(dv.getUint32(8, true)).toBe(bytes.byteLength)
      const jsonChunkLen = dv.getUint32(12, true)
      expect(jsonChunkLen % ALIGNMENT).toBe(0)
      // JSON chunk data is space-padded, so the last byte before the BIN
      // chunk header is either '}' or a space — never a stray zero.
      expect([0x7D, 0x20]).toContain(bytes[20 + jsonChunkLen - 1])
    })

    it('reports the size it saved', async () => {
      const {container} = cachedArtifact()
      const kept = exportArtifact({bytes: container, options: {}})
      const {stats} = await exportStripped()

      expect(stats.outputBytes).toBeLessThan(kept.stats.outputBytes)
      expect(stats.inputBytes).toBe(container.byteLength)
    })
  })

  describe('a Meshopt-compressed artifact', () => {
    /**
     * @return {Promise<{json: object, bin: Uint8Array, bytes: Uint8Array, container: Uint8Array}>}
     */
    async function exportStrippedMeshopt() {
      const {container} = cachedArtifact(meshoptGlbJson(), meshoptBin())
      const {blob} = exportArtifact({bytes: container, options: {stripBldrsMetadata: true}})
      const bytes = await blobBytes(blob)
      return {...parseGlb(bytes), bytes, container}
    }

    it('carries the compressed ranges over, byte for byte, at their new offsets', async () => {
      // Every compressed view sits on the fallback buffer, so "skip anything
      // not on buffer 0" emptied the BIN chunk outright and the required
      // Meshopt references addressed bytes that were no longer in the file —
      // an unopenable download, not a smaller one (#1841).
      const {json, bin} = await exportStrippedMeshopt()

      expect(bin.byteLength).toBe(38)
      expect(json.buffers[0].byteLength).toBe(38)
      const [first, second] = json.bufferViews
      const rangeA = first.extensions.EXT_meshopt_compression
      const rangeB = second.extensions.EXT_meshopt_compression
      expect(rangeA).toMatchObject({buffer: 0, byteOffset: 0, byteLength: MESHOPT_A_BYTES.byteLength})
      expect(rangeB).toMatchObject({buffer: 0, byteOffset: 24, byteLength: MESHOPT_B_BYTES.byteLength})
      expect(bin.subarray(rangeA.byteOffset, rangeA.byteOffset + rangeA.byteLength))
        .toEqual(MESHOPT_A_BYTES)
      expect(bin.subarray(rangeB.byteOffset, rangeB.byteOffset + rangeB.byteLength))
        .toEqual(MESHOPT_B_BYTES)
      // The payload's bytes are what left; nothing else moved out of reach.
      expect([...bin]).not.toContain(MESHOPT_PAYLOAD_BYTES[0])
    })

    it('leaves the decoded side and the fallback buffer alone', async () => {
      const {json} = await exportStrippedMeshopt()

      expect(json.bufferViews.map((v) => ({buffer: v.buffer, byteOffset: v.byteOffset, byteLength: v.byteLength})))
        .toEqual([
          {buffer: 1, byteOffset: 0, byteLength: MESHOPT_DECODED_A},
          {buffer: 1, byteOffset: MESHOPT_DECODED_A, byteLength: MESHOPT_DECODED_B},
        ])
      expect(json.buffers[1]).toEqual({
        byteLength: MESHOPT_DECODED_A + MESHOPT_DECODED_B,
        extensions: {EXT_meshopt_compression: {fallback: true}},
      })
      expect(json.extensionsRequired).toEqual(['EXT_meshopt_compression'])
      expect(json.accessors.map((a) => a.bufferView)).toEqual([0, 1])
      expect(JSON.stringify(json)).not.toContain('BLDRS_')
    })

    it('repacks a GLB whose header, chunks and buffer agree', async () => {
      const {bytes, json} = await exportStrippedMeshopt()
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

      expect(magic(bytes)).toBe(GLTF_MAGIC)
      expect(dv.getUint32(8, true)).toBe(bytes.byteLength)
      const jsonChunkLen = dv.getUint32(12, true)
      expect(jsonChunkLen % ALIGNMENT).toBe(0)
      const binChunkStart = 20 + jsonChunkLen
      const binChunkLen = dv.getUint32(binChunkStart, true)
      expect(binChunkLen % ALIGNMENT).toBe(0)
      expect(binChunkStart + 8 + binChunkLen).toBe(bytes.byteLength)
      // The chunk is the buffer, padded — not some other length entirely.
      expect(binChunkLen - json.buffers[0].byteLength).toBeLessThan(ALIGNMENT)
    })

    it('is the size the panel promised for it', async () => {
      const {container, bytes} = await exportStrippedMeshopt()

      const sizes = await artifactSizesFromFile(new Blob([container]))

      expect(sizes.withoutMetadata).toBe(bytes.byteLength)
      expect(sizes.metadataBytes).toBeGreaterThanOrEqual(MESHOPT_PAYLOAD_BYTES.byteLength)
    })
  })

  describe('a DRACO-compressed artifact', () => {
    it('keeps the encoded mesh, moved and re-indexed', async () => {
      // DRACO's payload is an ordinary bufferView, so it was never at risk
      // the way Meshopt's was — but the accessors carry no `bufferView` of
      // their own, so the extension's reference is the only thing standing
      // between this view and being dropped as unreferenced.
      const {container} = cachedArtifact(dracoGlbJson(), dracoBin())

      const {blob} = exportArtifact({bytes: container, options: {stripBldrsMetadata: true}})
      const {json, bin} = parseGlb(await blobBytes(blob))

      expect(bin).toEqual(DRACO_BYTES)
      expect(json.bufferViews).toEqual([{buffer: 0, byteOffset: 0, byteLength: DRACO_BYTES.byteLength}])
      expect(json.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression)
        .toEqual({bufferView: 0, attributes: {POSITION: 0}})
      expect(json.extensionsRequired).toEqual(['KHR_draco_mesh_compression'])
      expect(JSON.stringify(json)).not.toContain('BLDRS_')
    })
  })

  describe('filename', () => {
    it('prefers the model title', () => {
      expect(exportFilename({title: 'Momentum', sourceBasename: 'momentum.ifc'}))
        .toBe('Momentum.glb')
    })

    it('falls back to the source basename, minus its extension', () => {
      expect(exportFilename({sourceBasename: 'index.ifc'})).toBe('index.glb')
      expect(exportFilename({sourceBasename: 'nist/as1.stp'})).toBe('nist_as1.glb')
    })

    it('sanitises anything that would escape the download name', () => {
      // The value lands in a `<a download>` attribute and then in the user's
      // filesystem; a title is model-authored text, not a path.
      expect(exportFilename({title: '../../etc/passwd'})).toBe('etc_passwd.glb')
      expect(exportFilename({title: 'Bldrs Plaza: Level 2'})).toBe('Bldrs_Plaza_Level_2.glb')
    })

    it('has a default for a model with neither', () => {
      expect(exportFilename()).toBe('model.glb')
      expect(exportFilename({title: '   '})).toBe('model.glb')
    })
  })

  describe('refuses what it cannot honestly export', () => {
    it('rejects a non-container', () => {
      expect(() => exportArtifact({bytes: new Uint8Array([1, 2, 3, 4]), options: {}}))
        .toThrow(/BLDR/)
    })

    it('rejects a multi-chunk container rather than exporting a fraction of it', () => {
      const {glb} = cachedArtifact()
      const twoChunks = packGlbChunks([glb, glb])

      expect(() => exportArtifact({bytes: twoChunks, options: {}})).toThrow(/expected 1 chunk/)
    })
  })
})
