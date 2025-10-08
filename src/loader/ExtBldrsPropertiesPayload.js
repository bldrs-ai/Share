// ExtBldrsPropertiesPayload.js
// Simple custom GLTFLoader extension for reading a JSON payload
// embedded under extensions.ExtBldrsPropertiesPayload

export class ExtBldrsPropertiesPayload {
  constructor(parser) {
    this.name = 'ExtBldrsPropertiesPayload';
    this.parser = parser;
  }

  // Runs after the GLTF has been parsed and the scene is built
  async afterRoot(gltf) {
    const json = this.parser.json;
    const ext = json.extensions?.[this.name];
    if (ext) {
      // Attach the payload to scene.userData for easy access
      gltf.scene.userData.bldrsPayload = ext;
      console.info(`[${this.name}] Loaded payload:`, ext);
    }

    return gltf;
  }
}
