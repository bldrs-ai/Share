// Custom GLTFLoader extension for reading a gzipped JSON payload
// embedded under extensions.ExtBldrsPropertiesPayload.
//
// Per design/new/glb-model-sharing.md, this extension is the v0 reader
// and will be split into BLDRS_model_metadata + BLDRS_element_properties
// + BLDRS_spatial_tree in Phase 2.
import * as pako from 'pako'
import debug from '../utils/debug'


/**
 * GLTFLoader extension that decompresses a gzipped JSON payload from a
 * named GLTF extension and attaches it to `gltf.scene.userData.bldrsPayload`.
 */
export class ExtBldrsPropertiesPayload {
  propertiesPayload = null

  /**
   * @param {object} parser GLTFLoader parser passed at registration time
   */
  constructor(parser) {
    this.name = 'ExtBldrsPropertiesPayload'
    this.parser = parser
    this.propertiesPayload = null
  }

  /**
   * Decompress with pako, trying gzip then deflate.
   *
   * @param {Uint8Array} compressedData
   * @return {string} the decoded JSON string
   */
  decompressData(compressedData) {
    try {
      return pako.ungzip(compressedData, {to: 'string'})
    } catch (gzipErr) {
      try {
        return pako.inflate(compressedData, {to: 'string'})
      } catch (deflateErr) {
        console.error(`[${this.name}] pako failed (gzip & deflate)`, {gzipErr, deflateErr})
        // Surface the first (gzip) error to preserve the most relevant cause.
        throw gzipErr
      }
    }
  }

  /**
   * Runs after GLTFLoader has parsed the file and built the scene.
   *
   * @param {object} gltf parsed GLTF object
   * @return {Promise<object>} the same gltf object (per GLTFLoader extension contract)
   */
  async afterRoot(gltf) {
    const json = this.parser.json
    const ext = json.extensions?.[this.name]

    if (ext) {
      if (ext.compressed && ext.bufferView !== undefined) {
        try {
          const bv = json.bufferViews[ext.bufferView]
          const bufferIndex = bv.buffer
          const byteOffset = bv.byteOffset || 0
          const byteLength = bv.byteLength

          const arrayBuffer = await this.parser.getDependency('buffer', bufferIndex)
          const compressedData = new Uint8Array(arrayBuffer, byteOffset, byteLength)

          const decompressed = this.decompressData(compressedData)
          this.propertiesPayload = JSON.parse(decompressed)

          gltf.scene.userData.bldrsPayload = this.propertiesPayload

          debug().log(
            `[${this.name}] Decompressed payload from bufferView ${ext.bufferView} ` +
            `(compressed ${compressedData.length}B -> decompressed ${decompressed.length}B)`)
        } catch (error) {
          console.error(`[${this.name}] Failed to decompress payload:`, error)
        }
      } else {
        // Legacy: uncompressed data directly in the extension object.
        gltf.scene.userData.bldrsPayload = ext
        debug().log(`[${this.name}] Loaded uncompressed payload`)
      }
    }

    return gltf
  }
}
