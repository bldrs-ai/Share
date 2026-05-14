// GLB writer for the Bldrs runtime artifact pipeline.
//
// Companion to src/loader/glbCacheKey.js (read side). Given the parsed
// Three.js model that web-ifc-three / IFCLoader has already produced and
// rendered, serialize it to a GLB binary and write it to OPFS at the
// cache key. The reader fast path in Loader.js#tryLoadCachedGlb picks it
// up on subsequent loads of the same source.
//
// Design: design/new/glb-model-sharing.md §"Pipelines/A. Originator" and
// §"Caching and lookup".
//
// Why GLTFExporter (and not conway's GeometryAggregator + Convertor)?
// We tried the conway path first. Two failure modes surfaced:
//   1. The aggregator filters by `CanonicalMeshType.BUFFER_GEOMETRY`
//      (geometry_aggregator.js:32) and silently drops every other mesh
//      type. Complex IFCs (Bldrs_Plaza, Momentum, Seestrasse) lose
//      structural elements that conway hadn't finalized to triangle
//      meshes, and the cached artifact renders as a fragmented skeleton.
//   2. Conway emits geometry at IFC source-world coordinates; the GLB
//      ends up thousands of units from origin, outside the orbit
//      control's fit-to-frame range.
// Both go away if we serialize what web-ifc-three already produced — the
// scene that's already on screen and known to render correctly. The
// tradeoff: GLBs are bigger than what conway's aggregator could produce
// (no de-instancing, no Draco). Acceptable for the cache MVP; revisit
// once the BLDRS_* extension story makes a custom writer worthwhile.
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js'
import {writeGlbBytesToOPFS} from '../OPFS/utils'
import {glbCacheKey} from './glbCacheKey'
import {
  activeGlbCompressionMode,
  compressGlb,
  schemaVersionFor,
} from './glbCompress'
import {packGlbChunks} from './glbContainer'
import {glbInfo, glbVerbose} from './glbLog'


/**
 * Serialize a Three.js Object3D (typically the IFCLoader-produced model)
 * to a single GLB ArrayBuffer. Resolves to null on failure rather than
 * throwing — the source model is already loaded; the cache write is a
 * fire-and-forget warm-up.
 *
 * Note on console noise: GLTFExporter emits one `console.warn` per
 * non-PBR material (`MeshStandardMaterial`/`MeshBasicMaterial`
 * recommended). web-ifc-three's IFCLoader produces `MeshLambertMaterial`,
 * so a typical IFC fires dozens of these warnings. They aren't
 * actionable from our side without rewriting every material to PBR
 * (which would change appearance), so we silence GLTFExporter's
 * specific message during parse and let other warnings through.
 *
 * @param {object} model Three.js root (Mesh / Group / Scene)
 * @return {Promise<Uint8Array|null>}
 */
export function exportThreeModelAsGlb(model) {
  return new Promise((resolve) => {
    const restoreConsoleWarn = silenceGltfExporterMaterialWarnings()
    const finish = (value) => {
      restoreConsoleWarn()
      resolve(value)
    }
    try {
      const exporter = new GLTFExporter()
      exporter.parse(
        model,
        (result) => {
          if (result instanceof ArrayBuffer) {
            finish(new Uint8Array(result))
          } else {
            // Non-binary mode shouldn't fire here, but guard anyway.
            glbInfo('writer: GLTFExporter returned non-binary; skipping')
            finish(null)
          }
        },
        (err) => {
          glbInfo('writer: GLTFExporter onError:', err)
          finish(null)
        },
        {binary: true},
      )
    } catch (e) {
      glbInfo('writer: GLTFExporter threw:', e)
      finish(null)
    }
  })
}


/**
 * Wrap `console.warn` for the duration of a GLTFExporter `parse` call
 * to swallow the per-material "Use MeshStandardMaterial or
 * MeshBasicMaterial for best results" warning. Returns a restore
 * function the caller invokes when parse settles. Counts suppressed
 * warnings and surfaces a single summary line via glbVerbose.
 *
 * @return {Function} restore — call to undo the patch
 */
function silenceGltfExporterMaterialWarnings() {
  const originalWarn = console.warn
  let suppressed = 0
  console.warn = function patchedWarn(...args) {
    if (typeof args[0] === 'string' && args[0].startsWith('GLTFExporter: Use MeshStandardMaterial')) {
      suppressed++
      return
    }
    originalWarn.apply(this, args)
  }
  return () => {
    console.warn = originalWarn
    if (suppressed > 0) {
      glbVerbose(`writer: silenced ${suppressed} GLTFExporter material warnings`)
    }
  }
}


/**
 * Export the loaded model and write the resulting GLB (wrapped in the
 * Bldrs container) to OPFS at the cache key the reader will look for.
 * Fire-and-forget at the call site — any failure is logged but never
 * thrown. Returns true if a GLB was written, false otherwise.
 *
 * @param {object} args
 * @param {object} args.model The parsed Three.js root
 * @param {string} args.kindLabel Human-readable source-kind tag for logs
 *   (e.g. 'github', 'local', 'upload', 'external'). Not used as a cache key.
 * @param {object} args.cacheKeyArgs Output of one of the sourceCacheKey
 *   adapters: {ns1, ns2, ns3, sourcePath, sourceHash}.
 * @return {Promise<boolean>}
 */
export async function exportAndCacheGlb({model, kindLabel, cacheKeyArgs}) {
  const startMs = Date.now()
  try {
    const filePath = cacheKeyArgs.sourcePath
    const requestedMode = activeGlbCompressionMode()
    glbInfo(
      `writer: ${kindLabel} source, key=${cacheKeyArgs.ns1}/${cacheKeyArgs.ns2}/${cacheKeyArgs.ns3}/` +
      `${filePath} sha=${cacheKeyArgs.sourceHash} requestedCompression=${requestedMode || 'none'}`)
    glbVerbose('writer: cacheKeyArgs =', cacheKeyArgs)
    const rawBytes = await exportThreeModelAsGlb(model)
    if (!rawBytes || rawBytes.byteLength === 0) {
      glbInfo('writer: skipped (GLTFExporter produced no bytes)')
      return false
    }
    glbVerbose('writer: GLTFExporter produced', rawBytes.byteLength, 'bytes')
    // Use the *actual* compression mode (compressGlb may fall back to
    // null on encoder failure) so the cached artifact lands in the
    // matching schema slot. Otherwise a -draco / -meshopt suffix on
    // uncompressed bytes would mislead a reader running with the same
    // flag (it would expect compressed input on the next load).
    const {bytes, mode} = await compressGlb(rawBytes, requestedMode)
    const schemaVer = schemaVersionFor(mode)
    const packed = packGlbChunks([bytes], mode)
    const key = glbCacheKey({...cacheKeyArgs, schemaVer})
    await writeGlbBytesToOPFS(
      packed, key.originalFilePath, key.commitHash, key.owner, key.repo, key.branch)
    glbInfo(
      `writer: wrote ${packed.byteLength}B (1 chunk${mode ? `, ${mode}-compressed` : ''}) ` +
      `to ${key.owner}/${key.repo}/${key.branch}/${key.originalFilePath} in ${Date.now() - startMs}ms`)
    return true
  } catch (e) {
    glbInfo('writer: skipped (threw); reader will fall back to source on next load:', e)
    return false
  }
}
