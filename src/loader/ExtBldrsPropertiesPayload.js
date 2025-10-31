// Simple custom GLTFLoader extension for reading a JSON payload
// embedded under extensions.ExtBldrsPropertiesPayload

// Make sure pako is installed: npm i pako
import * as pako from 'pako';

export class ExtBldrsPropertiesPayload {
  propertiesPayload = null;

  constructor(parser) {
    this.name = 'ExtBldrsPropertiesPayload';
    this.parser = parser;
    this.propertiesPayload = null;
  }

  /**
   * Decompress using pako only.
   * Tries gzip first, falls back to deflate.
   * @param {Uint8Array} compressedData
   * @returns {Promise<string>}
   */
  async decompressData(compressedData) {
    try {
      return pako.ungzip(compressedData, { to: 'string' });
    } catch (gzipErr) {
      try {
        return pako.inflate(compressedData, { to: 'string' });
      } catch (deflateErr) {
        console.error(`[${this.name}] pako failed (gzip & deflate)`, { gzipErr, deflateErr });
        throw gzipErr; // surface the first error
      }
    }
  }

  // Runs after the GLTF has been parsed and the scene is built
  async afterRoot(gltf) {
    const json = this.parser.json;
    const ext = json.extensions?.[this.name];

    if (ext) {
      if (ext.compressed && ext.bufferView !== undefined) {
        try {
          const bv = json.bufferViews[ext.bufferView];
          const bufferIndex = bv.buffer;
          const byteOffset = bv.byteOffset || 0;
          const byteLength = bv.byteLength;

          const arrayBuffer = await this.parser.getDependency('buffer', bufferIndex);
          const compressedData = new Uint8Array(arrayBuffer, byteOffset, byteLength);

          const decompressed = await this.decompressData(compressedData);
          this.propertiesPayload = JSON.parse(decompressed);

          gltf.scene.userData.bldrsPayload = this.propertiesPayload;

          console.info(
            `[${this.name}] Decompressed payload from bufferView ${ext.bufferView} ` +
            `(compressed ${compressedData.length}B → decompressed ${decompressed.length}B)`
          );
          console.log(this.propertiesPayload);
        } catch (error) {
          console.error(`[${this.name}] Failed to decompress payload:`, error);
        }
      } else {
        // Legacy: uncompressed data directly in extension
        gltf.scene.userData.bldrsPayload = ext;
        console.info(`[${this.name}] Loaded uncompressed payload:`, ext);
      }
    }

    return gltf;
  }
}
