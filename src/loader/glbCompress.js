// Optional post-export compression for cached GLBs.
//
// `glbExport.js` calls into here after `GLTFExporter` produces an
// uncompressed GLB. We then run the bytes through `@gltf-transform`'s
// `draco()` or `meshopt()` transform and re-serialize. Both extensions
// (`KHR_draco_mesh_compression`, `EXT_meshopt_compression`) are
// supported by `three`'s `GLTFLoader` when the matching decoder is
// registered.
//
// Encoder loading strategy:
// - **DRACO**: inject a `<script>` tag pointing at our existing
//   `/static/js/draco/draco_encoder.js` (already shipped via
//   `public/static/js/draco/`). The `draco3dgltf` npm package would be
//   the conventional choice but its emscripten glue does `require("fs")`
//   /`require("path")` for wasm bootstrap, which doesn't play nicely
//   with esbuild's browser bundling. Loading the script lazily side-
//   steps the bundler entirely and reuses assets the reader path
//   already pays for.
// - **Meshopt**: `MeshoptEncoder` from the `meshoptimizer` package is a
//   proper browser ES module; import directly.
//
// All work is deferred until `compressGlb()` is called; nothing imports
// the encoder modules at module-load time so the cost is zero when the
// compression flags are off.
import {isFeatureEnabled} from '../FeatureFlags'
import {BLDRS_GLB_SCHEMA_VERSION} from './glbCacheKey'
import {glbInfo, glbVerbose} from './glbLog'


/** @typedef {'draco'|'meshopt'|null} GlbCompressionMode */


/**
 * Resolve the active compression mode from feature flags. `glbDraco`
 * wins over `glbMeshopt` when both are on (deterministic, also lets a
 * user explicitly compare DRACO over Meshopt by toggling the other
 * off). Returns null when neither flag is set.
 *
 * @return {GlbCompressionMode}
 */
export function activeGlbCompressionMode() {
  if (isFeatureEnabled('glbDraco')) {
    return 'draco'
  }
  if (isFeatureEnabled('glbMeshopt')) {
    return 'meshopt'
  }
  return null
}


/**
 * Resolve the schema version suffix for a given compression mode. The
 * resolved string is what `glbArtifactPath` embeds in the filename, so
 * compressed and uncompressed artifacts naturally partition into
 * separate cache slots. A reader running with the flag off will never
 * read a flag-on writer's compressed bytes (and vice versa).
 *
 * @param {GlbCompressionMode} mode
 * @return {string}
 */
export function schemaVersionFor(mode) {
  if (mode === 'draco') {
    return `${BLDRS_GLB_SCHEMA_VERSION}-draco`
  }
  if (mode === 'meshopt') {
    return `${BLDRS_GLB_SCHEMA_VERSION}-meshopt`
  }
  return BLDRS_GLB_SCHEMA_VERSION
}


/**
 * Convenience for the common reader/writer pattern: resolve the schema
 * version matching the currently active compression flag state.
 *
 * @return {string}
 */
export function activeSchemaVersion() {
  return schemaVersionFor(activeGlbCompressionMode())
}


/**
 * Compress an uncompressed GLB's geometry buffers using the named
 * extension. Resolves to the original bytes (unchanged) on `null` mode
 * or any failure — the caller treats compression as best-effort and
 * keeps the artifact rather than dropping the cache write entirely.
 *
 * @param {Uint8Array} glbBytes uncompressed GLB binary
 * @param {GlbCompressionMode} mode
 * @return {Promise<Uint8Array>}
 */
export async function compressGlb(glbBytes, mode) {
  if (!mode) {
    return glbBytes
  }
  const startMs = Date.now()
  try {
    const {WebIO} = await import('@gltf-transform/core')
    const {KHRDracoMeshCompression, EXTMeshoptCompression} = await import('@gltf-transform/extensions')

    const io = new WebIO()
    let transformOp = null

    if (mode === 'draco') {
      const encoderModule = await loadDracoEncoder()
      const {draco} = await import('@gltf-transform/functions')
      io.registerExtensions([KHRDracoMeshCompression])
        .registerDependencies({'draco3d.encoder': encoderModule})
      transformOp = draco({method: 'edgebreaker'})
    } else if (mode === 'meshopt') {
      const {MeshoptEncoder} = await import('meshoptimizer')
      await MeshoptEncoder.ready
      const {meshopt} = await import('@gltf-transform/functions')
      io.registerExtensions([EXTMeshoptCompression])
      transformOp = meshopt({encoder: MeshoptEncoder, level: 'medium'})
    } else {
      glbInfo(`compress: unknown mode "${mode}"; passing bytes through`)
      return glbBytes
    }

    const doc = await io.readBinary(glbBytes)
    await doc.transform(transformOp)
    const out = await io.writeBinary(doc)
    const ratio = ((1 - (out.byteLength / glbBytes.byteLength)) * 100).toFixed(1) // eslint-disable-line no-magic-numbers
    glbInfo(
      `compress: ${mode} ${glbBytes.byteLength}B → ${out.byteLength}B ` +
      `(${ratio}% reduction) in ${Date.now() - startMs}ms`)
    return out
  } catch (e) {
    glbInfo(`compress: ${mode} failed, falling back to uncompressed:`, e)
    return glbBytes
  }
}


// Resolved at most once per page; subsequent calls return the cached
// encoder factory.
let dracoEncoderPromise = null


/**
 * Lazy-load Google's DRACO encoder by injecting `/static/js/draco/
 * draco_encoder.js` as a `<script>`, then instantiating the
 * `DracoEncoderModule` global. The returned object is what
 * `@gltf-transform`'s `draco()` transform expects under
 * `draco3d.encoder`.
 *
 * @return {Promise<object>} the instantiated encoder Module
 */
function loadDracoEncoder() {
  if (dracoEncoderPromise) {
    return dracoEncoderPromise
  }
  dracoEncoderPromise = (async () => {
    if (typeof window === 'undefined') {
      throw new Error('loadDracoEncoder: no window')
    }
    if (typeof window.DracoEncoderModule !== 'function') {
      glbVerbose('compress: injecting /static/js/draco/draco_encoder.js')
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = '/static/js/draco/draco_encoder.js'
        s.async = true
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('Failed to load draco_encoder.js'))
        document.head.appendChild(s)
      })
    }
    if (typeof window.DracoEncoderModule !== 'function') {
      throw new Error('DracoEncoderModule global not present after script load')
    }
    // eslint-disable-next-line new-cap
    return await window.DracoEncoderModule({
      locateFile: (file) => `/static/js/draco/${file}`,
    })
  })()
  return dracoEncoderPromise
}
