// Tests for the GLB pro module, on REAL bytes: a tiny but well-formed GLB
// carrying both Bldrs-private and ratified extensions is packed into a Bldrs
// container exactly as `glbExport.js` (the writer) would, then exported.
// Nothing here is mocked — the whole point of the module is what comes out
// the other end, byte for byte.
import {packGlbChunks} from '../../loader/glbContainer'
import {parseGlb, serializeGlb} from '../../loader/injectGlbExtensions'
import {exportArtifact, exportFilename, format} from './glbExport'


/* eslint-disable no-magic-numbers */
const BIN = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
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
      BLDRS_spatial_tree: {bufferView: 0},
      BLDRS_element_properties: {bufferView: 0},
    },
    scene: 0,
    scenes: [{nodes: [0], extras: {bldrsTitle: 'Momentum'}, extensions: {BLDRS_view_states: {}}}],
    nodes: [{mesh: 0, extensions: {BLDRS_instance_tables: {}, EXT_mesh_gpu_instancing: {attributes: {}}}}],
    meshes: [{primitives: [{attributes: {}, extensions: {BLDRS_face_ids: {bufferView: 0}}}]}],
    buffers: [{byteLength: BIN.byteLength}],
    bufferViews: [{buffer: 0, byteOffset: 0, byteLength: BIN.byteLength}],
  }
}


/**
 * The cached artifact as OPFS holds it: one GLB chunk inside a Bldrs
 * container (glbContainer.js), which is what the writer always packs.
 *
 * @param {object} [json]
 * @return {{container: Uint8Array, glb: Uint8Array}}
 */
function cachedArtifact(json = glbJson()) {
  const glb = serializeGlb(json, BIN)
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
      expect(stats).toEqual({
        inputBytes: container.byteLength,
        outputBytes: glb.byteLength,
        strippedExtensions: [],
      })
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
      expect(json.meshes[0].primitives[0].attributes).toEqual({})
      expect(json.scenes[0].extras).toEqual({bldrsTitle: 'Momentum'})
      expect(bin).toEqual(BIN)
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
