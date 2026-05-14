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
//   `/static/js/draco/draco_encoder.js` (shipped via
//   `public/static/js/draco/`). The encoder JS is the WASM-aware build
//   from Google's `draco3d` npm package — it loads `draco_encoder.wasm`
//   sibling at runtime via our `locateFile` callback. Earlier we shipped
//   the asm.js-only encoder build (no `.wasm` sibling), which hung the
//   main thread at 100% CPU on dense meshes; the WASM build is ~10× faster.
//   Loading via script tag (vs `import 'draco3d'`) sidesteps the
//   package's `require("fs")` / `require("path")` calls in browser
//   bundlers like esbuild.
// - **Meshopt**: `MeshoptEncoder` from `meshoptimizer/encoder` subpath
//   (the default `'meshoptimizer'` re-export doesn't surface the
//   encoder under bundler dedup with our reader-side `meshoptimizer/decoder`
//   static import).
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
 * extension. Returns `{bytes, mode}` so callers can tell whether
 * compression actually applied — on any failure (or `null` mode) the
 * returned mode is `null` and bytes are the original input. Cache
 * writers use the *returned* mode to pick the schema slot, so a
 * failed-and-fell-back artifact lands in the uncompressed slot rather
 * than masquerading as compressed.
 *
 * @param {Uint8Array} glbBytes uncompressed GLB binary
 * @param {GlbCompressionMode} mode
 * @return {Promise<{bytes:Uint8Array, mode:GlbCompressionMode}>}
 */
export async function compressGlb(glbBytes, mode) {
  if (!mode) {
    return {bytes: glbBytes, mode: null}
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
      const {MeshoptEncoder} = await import('meshoptimizer/encoder')
      await MeshoptEncoder.ready
      const {meshopt} = await import('@gltf-transform/functions')
      io.registerExtensions([EXTMeshoptCompression])
        .registerDependencies({'meshopt.encoder': MeshoptEncoder})
      transformOp = meshopt({encoder: MeshoptEncoder, level: 'medium'})
    } else {
      glbInfo(`compress: unknown mode "${mode}"; passing bytes through`)
      return {bytes: glbBytes, mode: null}
    }

    const doc = await io.readBinary(glbBytes)
    await doc.transform(transformOp)
    const out = await io.writeBinary(doc)
    const ratio = ((1 - (out.byteLength / glbBytes.byteLength)) * 100).toFixed(1) // eslint-disable-line no-magic-numbers
    glbInfo(
      `compress: ${mode} ${glbBytes.byteLength}B → ${out.byteLength}B ` +
      `(${ratio}% reduction) in ${Date.now() - startMs}ms`)
    return {bytes: out, mode}
  } catch (e) {
    glbInfo(`compress: ${mode} failed, falling back to uncompressed:`, e)
    return {bytes: glbBytes, mode: null}
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
