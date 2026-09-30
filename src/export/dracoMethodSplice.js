// Draco with a different encoder METHOD per primitive, which `@gltf-transform`
// 4.3.0 cannot express on its own.
//
// Why it is needed (share-140 #1871): a collapsed node's merged primitive must
// be encoded SEQUENTIALLY, because its rows are contiguous triangle runs and
// EDGEBREAKER reorders triangles across them (design/new/glb-export-premium.md
// §1.1d, "Draco exports carry a lossy witness instead"). Nothing else in a
// collapsed artifact needs that — a genuinely instanced node's identity is
// per-instance — but the method used to be chosen once per FILE, so one
// collapsed node sent every instanced primitive through SEQUENTIAL too.
// Measured through a real browser on a STEP model with four collapsed elements
// beside 25 instanced nodes, the Draco export went from 559,068 B with the
// collapse off to 1,971,820 B with it on (+253%).
//
// Why a splice: `KHRDracoMeshCompression.setEncoderOptions` is document-wide,
// and its per-primitive `encodeGeometry` is module-private — the options object
// is copied before the primitive is in scope, so there is no hook that can see
// which primitive is being encoded. The alternatives that reach inside the
// write (wrapping the draco3d module to recognise a primitive by its index
// array's identity; overriding `prewrite`, which means copying the library's
// writer-context bookkeeping) both depend on private internals of a pinned
// dependency. So the transform writes twice and this module joins the results
// at the raw-GLB level, in the same post-pass style as the payload detach /
// re-attach around it (`glbCompression.js`) and `loader/glbSlim.js`:
//
//   1. the whole document, EDGEBREAKER — the structure the result keeps, and
//      the bytes every unordered primitive ships with;
//   2. the SAME document with every unordered primitive disposed, SEQUENTIAL —
//      so only the ordered primitives are encoded a second time.
//
// Each ordered primitive's Draco payload in (1) is then replaced by its
// payload from (2), with the counts the two methods disagree on copied across.
// Every Draco primitive is encoded on its own grid (`quantizationVolume:
// 'mesh'`, the only volume `exportQuality.js` allows), so the SEQUENTIAL
// payload of a primitive does not depend on which other primitives were in
// the document beside it.
//
// Design: design/new/glb-export-premium.md §1.1d.
import {parseGlb, serializeGlb} from '../loader/injectGlbExtensions'


const DRACO_EXTENSION = 'KHR_draco_mesh_compression'


/**
 * Replace the Draco payloads of the primitives of `meshIndices` in `fullBytes`
 * with their payloads from `subsetBytes`.
 *
 * Both files must come from one `@gltf-transform` document, written in that
 * order, with nothing but primitives of OTHER meshes disposed in between: the
 * writer emits meshes in document order and a mesh that lost every primitive
 * is still emitted, so mesh i and its primitive j name the same primitive in
 * both. Anything that says otherwise throws, and the caller's codec-failure
 * path takes it — a mismatched splice would attach one primitive's geometry
 * to another's material and node, which is worse than no compression.
 *
 * @param {Uint8Array} fullBytes every primitive encoded (the base)
 * @param {Uint8Array} subsetBytes the ordered primitives encoded again
 * @param {Set<number>} meshIndices meshes whose primitives take the subset's
 *   payloads
 * @return {Uint8Array} the spliced GLB
 */
export function spliceDracoPayloads(fullBytes, subsetBytes, meshIndices) {
  const full = parseGlb(fullBytes)
  const subset = parseGlb(subsetBytes)
  const {json} = full
  if (json.buffers?.length !== 1 || subset.json.buffers?.length !== 1 || !full.bin || !subset.bin) {
    throw new Error('spliceDracoPayloads: expected one GLB buffer in each file')
  }
  if (json.meshes?.length !== subset.json.meshes?.length) {
    throw new Error('spliceDracoPayloads: the two writes disagree on the mesh list')
  }

  // Full-file bufferView index → the bytes it holds after the splice. Two
  // primitives `@gltf-transform` deduplicated share one payload in both
  // files, so the same view may be set twice, to the same bytes.
  const replaced = new Map()
  for (const m of meshIndices) {
    const primitives = json.meshes[m]?.primitives || []
    const subsetPrimitives = subset.json.meshes[m]?.primitives || []
    if (primitives.length !== subsetPrimitives.length) {
      throw new Error(`spliceDracoPayloads: mesh ${m} has a different primitive count in the two writes`)
    }
    primitives.forEach((primitive, j) => {
      const into = primitive.extensions?.[DRACO_EXTENSION]
      const from = subsetPrimitives[j].extensions?.[DRACO_EXTENSION]
      if (!into && !from) {
        // Not Draco-encodable in either write (non-indexed or not
        // TRIANGLES): it is stored plain, the same in both.
        return
      }
      if (!into || !from) {
        throw new Error(`spliceDracoPayloads: mesh ${m} primitive ${j} is Draco in only one write`)
      }
      const subsetPrimitive = subsetPrimitives[j]
      const semantics = Object.keys(primitive.attributes).sort()
      if (semantics.join() !== Object.keys(subsetPrimitive.attributes).sort().join() ||
          !Number.isInteger(primitive.indices) || !Number.isInteger(subsetPrimitive.indices)) {
        throw new Error(`spliceDracoPayloads: mesh ${m} primitive ${j} differs between the two writes`)
      }
      const view = subset.json.bufferViews[from.bufferView]
      const at = view.byteOffset ?? 0
      replaced.set(into.bufferView, subset.bin.subarray(at, at + view.byteLength))
      into.attributes = {...from.attributes}
      // The counts are the encoder's output, not the source's: the two methods
      // weld and split vertices differently, and the index type follows the
      // vertex count (`@gltf-transform` widens it past 65534). min/max are
      // taken from the source arrays, so they already agree.
      const indices = json.accessors[primitive.indices]
      const subsetIndices = subset.json.accessors[subsetPrimitive.indices]
      indices.count = subsetIndices.count
      indices.componentType = subsetIndices.componentType
      for (const semantic of semantics) {
        json.accessors[primitive.attributes[semantic]].count =
          subset.json.accessors[subsetPrimitive.attributes[semantic]].count
      }
    })
  }
  if (replaced.size === 0) {
    return fullBytes
  }

  // Re-lay the BIN in view order: a replaced payload is a different length,
  // so every view after it moves. 4-byte starts, which satisfies every
  // accessor's component alignment, as `@gltf-transform`'s own layout does.
  let end = 0
  const pieces = json.bufferViews.map((view, i) => {
    const at = view.byteOffset ?? 0
    const bytes = replaced.get(i) ?? full.bin.subarray(at, at + view.byteLength)
    const offset = (end + 3) & ~3
    view.byteOffset = offset
    view.byteLength = bytes.byteLength
    end = offset + bytes.byteLength
    return {bytes, offset}
  })
  const bin = new Uint8Array(end)
  for (const {bytes, offset} of pieces) {
    bin.set(bytes, offset)
  }
  json.buffers[0].byteLength = end
  return serializeGlb(json, bin)
}
