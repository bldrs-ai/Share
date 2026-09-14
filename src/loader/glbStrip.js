import {stripBldrsJson} from './glbArtifactSize'
import {parseGlb, serializeGlb} from './injectGlbExtensions'


/**
 * Drop every `BLDRS_*` extension from a GLB, AND the bufferViews only they
 * referenced.
 *
 * Shared plain-JS, importable by both sides of the pro-module boundary: the
 * pro module (`export/pro/glbExport.js`) runs it for an uncompressed export,
 * and the host's compressor (`export/glbCompression.js`) runs it when a codec
 * fails and the export falls back to the uncompressed file — which must
 * still honour "Include Bldrs metadata: off", or the fallback would hand
 * over the properties and spatial tree the user asked to leave out (#1837
 * codex round 6). One copy, so the two paths cannot drift.
 *
 * Nothing here may import `three` or React: the pro bundle
 * (tools/esbuild/proModules.js) would otherwise stand up a second three
 * instance beside the host's.
 *
 * The payloads are gzipped bufferViews, and through v0.1 the JSON entries
 * went while their bytes stayed — valid glTF, but it made the toggle almost
 * free of charge in the only currency the user cares about (#1841). The BIN
 * chunk is rebuilt from the surviving views, which `stripBldrsJson` has
 * already re-indexed and re-laid at 4-byte boundaries.
 *
 * A GLB with no Bldrs data in it at all is returned untouched rather than
 * re-serialised: there is nothing to remove, and rewriting the user's file
 * to the byte-for-byte same content is a risk taken for no gain.
 *
 * @param {Uint8Array} glbBytes One standalone GLB (the container's chunk 0)
 * @return {{bytes: Uint8Array, strippedExtensions: Array<string>}}
 */
export function stripGlbBldrs(glbBytes) {
  const {json, bin} = parseGlb(glbBytes)
  const {strippedExtensions, binPlan, binByteLength, isChanged} = stripBldrsJson(json)
  if (!isChanged) {
    return {bytes: glbBytes, strippedExtensions}
  }
  return {bytes: serializeGlb(json, repackBin(bin, binPlan, binByteLength)), strippedExtensions}
}


/**
 * Copy the surviving bufferViews into a compacted BIN chunk, following the
 * layout `stripBldrsJson` already wrote into the JSON.
 *
 * @param {Uint8Array|null} bin The original BIN chunk
 * @param {Array<{fromOffset: number, byteLength: number, toOffset: number}>} binPlan
 * @param {number} binByteLength Length of the compacted chunk
 * @return {Uint8Array|null} null when nothing binary survives
 */
function repackBin(bin, binPlan, binByteLength) {
  if (!bin || binByteLength === 0) {
    return null
  }
  const out = new Uint8Array(binByteLength)
  for (const {fromOffset, byteLength, toOffset} of binPlan) {
    out.set(bin.subarray(fromOffset, fromOffset + byteLength), toOffset)
  }
  return out
}
