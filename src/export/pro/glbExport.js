import {unpackGlbContainer} from '../../loader/glbContainer'
import {parseGlb, serializeGlb} from '../../loader/injectGlbExtensions'


/**
 * GLB export — the premium module's payload.
 *
 * The artifact Share already caches in OPFS is a Bldrs container
 * (`glbContainer.js`) holding exactly one chunk, and that chunk IS a valid
 * standalone GLB. So the export is, at the byte level, chunk 0 — no
 * re-parse, no re-serialise, nothing to get wrong — unless the user asks to
 * strip the Bldrs metadata, which is the one case that rewrites the file.
 *
 * NOTHING in this directory may import `three` or React: it is bundled on
 * its own (tools/esbuild/proModules.js) and served to the page as a
 * `blob:` module, so a `three` import here would stand up a SECOND three
 * instance beside the host's. Shared plain-JS source is fine and is why
 * `parseGlb`/`serializeGlb` are reused rather than reimplemented.
 *
 * Design: design/new/glb-export-premium.md §4.3.
 */


export const format = {id: 'glb', ext: 'glb', mime: 'model/gltf-binary'}

// Every Bldrs-private glTF extension shares this prefix
// (BLDRS_spatial_tree, BLDRS_element_properties, BLDRS_face_ids,
// BLDRS_instance_tables). Ratified Khronos extensions —
// EXT_mesh_gpu_instancing above all, which the batched-native layout's
// geometry depends on — are NEVER touched.
const BLDRS_EXTENSION_PREFIX = 'BLDRS_'

const DEFAULT_BASENAME = 'model'
// Anything outside this set becomes '_': the string ends up in a
// `<a download>` attribute and then in the user's filesystem, so path
// separators and control characters have no business in it.
const UNSAFE_FILENAME_CHARS = /[^A-Za-z0-9._-]+/g


/**
 * Turn a cached Bldrs container into a downloadable `.glb`.
 *
 * Synchronous today, and deliberately not declared `async` (the repo lints
 * for `require-await`); the registry contract is that callers `await` the
 * result, so a later format is free to be genuinely asynchronous.
 *
 * @param {object} args
 * @param {Uint8Array|ArrayBuffer} args.bytes The OPFS artifact's bytes
 * @param {object} [args.options]
 * @param {boolean} [args.options.stripBldrsMetadata] Drop every `BLDRS_*`
 *   extension before handing the file over (for onward sharing — the psets
 *   travel with the model otherwise)
 * @param {string} [args.options.title] Model title, preferred for the filename
 * @param {string} [args.options.sourceBasename] Source filename, the fallback
 * @return {{blob: Blob, filename: string, stats: object}}
 */
export function exportArtifact({bytes, options = {}}) {
  const container = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const inputBytes = container.byteLength
  const {chunks} = unpackGlbContainer(container)
  if (!chunks.length) {
    throw new Error('exportArtifact: container has no chunks')
  }
  // The writer always packs exactly one chunk; a multi-chunk artifact would
  // be a future layout this module predates, and silently exporting its
  // first chunk would hand the user a fraction of their model.
  if (chunks.length > 1) {
    throw new Error(`exportArtifact: expected 1 chunk, got ${chunks.length}`)
  }

  let glbBytes = new Uint8Array(chunks[0])
  let strippedExtensions = []
  if (options.stripBldrsMetadata) {
    const {json, bin} = parseGlb(glbBytes)
    strippedExtensions = stripBldrsExtensions(json)
    // The stripped extensions' payloads were gzipped bufferViews; those
    // views are now orphaned but still in the BIN chunk. Leaving them is
    // valid glTF and keeps this a pure JSON edit — v0.1 accepts the size
    // cost and reports it (design/new/glb-export-premium.md §4.3).
    glbBytes = serializeGlb(json, bin)
  }

  return {
    blob: new Blob([glbBytes], {type: format.mime}),
    filename: exportFilename(options),
    stats: {inputBytes, outputBytes: glbBytes.byteLength, strippedExtensions},
  }
}


/**
 * Remove every `BLDRS_*` entry from a glTF JSON chunk, in place.
 *
 * @param {object} json Parsed glTF JSON
 * @return {Array<string>} the extension names removed, sorted, deduped
 */
export function stripBldrsExtensions(json) {
  const stripped = new Set()

  stripExtensionsOf(json, stripped)
  for (const collection of [json.nodes, json.meshes, json.scenes]) {
    for (const entry of collection || []) {
      stripExtensionsOf(entry, stripped)
      for (const primitive of entry.primitives || []) {
        stripExtensionsOf(primitive, stripped)
      }
    }
  }

  if (Array.isArray(json.extensionsUsed)) {
    json.extensionsUsed = json.extensionsUsed.filter((name) => !isBldrsExtension(name))
    if (json.extensionsUsed.length === 0) {
      delete json.extensionsUsed
    }
  }

  return [...stripped].sort()
}


/**
 * Filename for a downloaded export.
 *
 * @param {object} [options]
 * @param {string} [options.title] Model title (IFC project name, …)
 * @param {string} [options.sourceBasename] e.g. 'index.ifc'
 * @return {string} e.g. 'index.glb'
 */
export function exportFilename({title, sourceBasename} = {}) {
  const raw = (title || stripExtension(sourceBasename || '') || DEFAULT_BASENAME)
  // Trim leading/trailing '.' and '_' as well as substituting: a title of
  // '../../etc/passwd' sanitises to '.._.._etc_passwd', and a name that
  // starts with a dot is a hidden file on every unix the download lands on.
  const safe = raw.trim().replace(UNSAFE_FILENAME_CHARS, '_').replace(/^[._]+|[._]+$/g, '')
  return `${safe || DEFAULT_BASENAME}.${format.ext}`
}


/**
 * @param {string} name
 * @return {boolean} true for a Bldrs-private extension name
 */
function isBldrsExtension(name) {
  return typeof name === 'string' && name.startsWith(BLDRS_EXTENSION_PREFIX)
}


/**
 * Drop `BLDRS_*` keys from one extension holder, in place. An emptied
 * `extensions` object is removed outright — glTF allows `{}` but a viewer
 * showing "1 extension" for nothing is a worse artifact than one showing none.
 *
 * @param {object} holder Any glTF object that may carry `extensions`
 * @param {Set<string>} stripped Accumulator of removed names
 */
function stripExtensionsOf(holder, stripped) {
  const extensions = holder?.extensions
  if (!extensions || typeof extensions !== 'object') {
    return
  }
  for (const name of Object.keys(extensions)) {
    if (isBldrsExtension(name)) {
      delete extensions[name]
      stripped.add(name)
    }
  }
  if (Object.keys(extensions).length === 0) {
    delete holder.extensions
  }
}


/**
 * @param {string} basename e.g. 'model.ifc'
 * @return {string} e.g. 'model'
 */
function stripExtension(basename) {
  const lastDot = basename.lastIndexOf('.')
  return lastDot > 0 ? basename.slice(0, lastDot) : basename
}
