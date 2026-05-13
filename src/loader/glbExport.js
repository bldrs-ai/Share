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
import {packGlbChunks} from './glbContainer'
import {glbInfo, glbVerbose} from './glbLog'


/**
 * Serialize a Three.js Object3D (typically the IFCLoader-produced model)
 * to a single GLB ArrayBuffer. Resolves to null on failure rather than
 * throwing — the source model is already loaded; the cache write is a
 * fire-and-forget warm-up.
 *
 * @param {object} model Three.js root (Mesh / Group / Scene)
 * @return {Promise<Uint8Array|null>}
 */
export function exportThreeModelAsGlb(model) {
  return new Promise((resolve) => {
    try {
      const exporter = new GLTFExporter()
      exporter.parse(
        model,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(new Uint8Array(result))
          } else {
            // Non-binary mode shouldn't fire here, but guard anyway.
            glbInfo('writer: GLTFExporter returned non-binary; skipping')
            resolve(null)
          }
        },
        (err) => {
          glbInfo('writer: GLTFExporter onError:', err)
          resolve(null)
        },
        {binary: true},
      )
    } catch (e) {
      glbInfo('writer: GLTFExporter threw:', e)
      resolve(null)
    }
  })
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
    glbInfo(
      `writer: ${kindLabel} source, key=${cacheKeyArgs.ns1}/${cacheKeyArgs.ns2}/${cacheKeyArgs.ns3}/` +
      `${filePath} sha=${cacheKeyArgs.sourceHash}`)
    glbVerbose('writer: cacheKeyArgs =', cacheKeyArgs)
    const bytes = await exportThreeModelAsGlb(model)
    if (!bytes || bytes.byteLength === 0) {
      glbInfo('writer: skipped (GLTFExporter produced no bytes)')
      return false
    }
    glbVerbose('writer: GLTFExporter produced', bytes.byteLength, 'bytes')
    const packed = packGlbChunks([bytes])
    const key = glbCacheKey(cacheKeyArgs)
    await writeGlbBytesToOPFS(
      packed, key.originalFilePath, key.commitHash, key.owner, key.repo, key.branch)
    glbInfo(
      `writer: wrote ${packed.byteLength}B (1 chunk) to ${key.owner}/${key.repo}/${key.branch}/` +
      `${key.originalFilePath} in ${Date.now() - startMs}ms`)
    return true
  } catch (e) {
    glbInfo('writer: skipped (threw); reader will fall back to source on next load:', e)
    return false
  }
}
