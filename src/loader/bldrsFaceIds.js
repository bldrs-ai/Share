// BLDRS_face_ids GLTF extension — writer + reader.
//
// Decouples per-element IDs from the per-vertex attribute stream so
// geometry compression (DRACO, Meshopt) can do its job without
// corrupting picking. The vertex attributes themselves stay in the
// GLB (they're cheap, and they serve as a fallback for cache
// artifacts that predate this extension); we just don't TRUST them
// post-compression — the reader rebuilds `IfcInstanceMap` from this
// extension's per-triangle data instead, bypassing both
//   - DRACO's 16-bit quantization (which collapses expressID values
//     > 65535 onto duplicate quantized levels)
//   - Meshopt's vertex welding (which merges per-vertex IDs at
//     shared edges between adjacent elements)
// because the per-triangle ID array is a separate JSON payload that
// neither compressor touches.
//
// Triangle order MUST be preserved across compression for this to
// work. DRACO's `sequential` method preserves input triangle order
// (the default `edgebreaker` reorders for encoder efficiency).
// Meshopt's default pipeline reorders triangles for vertex-cache
// coherency — we don't currently have a way to disable that, so
// Meshopt stays skipped for IFC GLBs until we find a workaround or
// switch to per-product mesh emission (§3b.iii of the design doc).
//
// Wire shape:
//   extensionsUsed: [..., "BLDRS_face_ids"]
//   extensions.BLDRS_face_ids: {compressed: <bool>, bufferView: <int>}
// The bufferView holds gzipped JSON whose shape is:
//   {
//     perPrimitive: [
//       {expressIds: <base64-Uint32>, instanceIds: <base64-Uint32>|undefined,
//        length: <triangleCount>},
//       ... // one entry per glTF primitive in flat traversal order;
//           // null entries are allowed (primitive carries no _EXPRESSID)
//     ]
//   }
// Per-primitive integer arrays are Base64-encoded little-endian
// Uint32 (4 bytes per triangle). v1 trades ~20% encoding overhead vs
// raw bufferViews for compatibility with the existing
// `injectGlbExtensions` JSON pipeline; raw-bufferView format is a
// follow-up optimization once correctness is validated.
//
// Schema bump for this addition: glbCacheKey.js#BLDRS_GLB_SCHEMA_VERSION.
import {glbInfo} from './glbLog'


export const BLDRS_FACE_IDS_EXTENSION_NAME = 'BLDRS_face_ids'


/**
 * GLTFLoader plugin that decodes `BLDRS_face_ids` on read. Decompresses
 * the extension's gzipped JSON, decodes each primitive's Base64-encoded
 * Uint32 arrays back into typed arrays, and stashes the result on
 * `gltf.scene.userData.bldrsFaceIds`. The Loader's cache-hit decoration
 * walks `model.traverse`, matches each Three.js Mesh to one of these
 * entries by primitive-index order, and builds an `IfcInstanceMap`
 * from the per-triangle arrays.
 *
 * Register at GLTFLoader construction:
 *   loader.register((parser) => new BldrsFaceIdsReader(parser))
 *
 * Resolved data shape on userData:
 *   {
 *     perPrimitive: [
 *       {expressIds: Uint32Array, instanceIds: Uint32Array|null} | null,
 *       ...
 *     ]
 *   }
 */
export class BldrsFaceIdsReader {
  /**
   * @param {object} parser GLTFLoader parser passed at registration time.
   */
  constructor(parser) {
    this.name = BLDRS_FACE_IDS_EXTENSION_NAME
    this.parser = parser
  }

  /**
   * @param {object} gltf parsed GLTF object
   * @return {Promise<object>} the same gltf (GLTFLoader plugin contract)
   */
  async afterRoot(gltf) {
    const json = this.parser.json
    const ext = json.extensions?.[this.name]
    if (!ext) {
      return gltf
    }
    if (!ext.compressed || !Number.isInteger(ext.bufferView)) {
      glbInfo(`${this.name}: extension missing required {compressed, bufferView}; skipping`)
      return gltf
    }
    if (!Array.isArray(json.bufferViews) ||
        ext.bufferView < 0 ||
        ext.bufferView >= json.bufferViews.length) {
      glbInfo(
        `${this.name}: extension references out-of-range bufferView ` +
        `${ext.bufferView} (have ${json.bufferViews?.length ?? 0}); skipping`)
      return gltf
    }

    let parsed
    try {
      const bv = json.bufferViews[ext.bufferView]
      const arrayBuffer = await this.parser.getDependency('buffer', bv.buffer)
      const compressed = new Uint8Array(arrayBuffer, bv.byteOffset || 0, bv.byteLength)
      const pako = await import('pako')
      const decompressed = pako.ungzip(compressed, {to: 'string'})
      parsed = JSON.parse(decompressed)
    } catch (e) {
      glbInfo(`${this.name}: failed to decompress/parse payload:`, e)
      return gltf
    }
    if (!parsed || !Array.isArray(parsed.perPrimitive)) {
      glbInfo(`${this.name}: payload missing perPrimitive array; skipping`)
      return gltf
    }

    const resolved = parsed.perPrimitive.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const expressIds = entry.expressIds ? base64ToUint32Array(entry.expressIds) : null
      const instanceIds = entry.instanceIds ? base64ToUint32Array(entry.instanceIds) : null
      if (!expressIds) {
        return null
      }
      return {expressIds, instanceIds}
    })

    if (gltf.scene) {
      gltf.scene.userData.bldrsFaceIds = {perPrimitive: resolved}
      const total = resolved.reduce(
        (n, e) => n + (e?.expressIds?.length ?? 0), 0)
      glbInfo(
        `${this.name}: resolved ${resolved.length} primitive entries — ` +
        `${total.toLocaleString()} triangles total`)
    } else {
      glbInfo(`${this.name}: gltf has no default scene; cannot attach face_ids`)
    }
    return gltf
  }
}


/**
 * Walk a freshly-exported GLB and pull per-vertex `_EXPRESSID` /
 * `_INSTANCEID` data out as per-triangle arrays — the input the
 * writer needs to populate `BLDRS_face_ids`.
 *
 * For each glTF primitive that carries `_EXPRESSID`:
 *   1. Read the index buffer (triangleCount = indexLength / 3).
 *   2. Read the per-vertex `_EXPRESSID` accessor.
 *   3. For each triangle t, set `expressIds[t] = perVertex[index[t*3]]`.
 *      The Conway-direct assembler emits the same ID to all three
 *      vertices of a triangle (per-PlacedGeometry slab), so vertex 0
 *      is representative. This matches `instanceMapFromGeometry`'s
 *      same-assumption read in the live cache-hit path today.
 *   4. Same for `_INSTANCEID` when present.
 *
 * Returns an object the writer hands to `buildFaceIdsExtensionData`
 * for Base64-encoding, or `null` when no primitive in the GLB has
 * `_EXPRESSID` (non-IFC sources or unstructured GLBs).
 *
 * @param {object} json parsed GLB JSON
 * @param {Uint8Array} bin GLB BIN chunk bytes (sliced to `buffers[0].byteLength`)
 * @return {object|null} `{perPrimitive: [{expressIds, instanceIds}, ...]}` or null
 */
export function capturePerTriangleIds(json, bin) {
  if (!Array.isArray(json?.meshes) || !Array.isArray(json.accessors) ||
      !Array.isArray(json.bufferViews) || !bin) {
    return null
  }
  const perPrimitive = []
  let captured = 0
  for (const mesh of json.meshes) {
    if (!Array.isArray(mesh.primitives)) {
      continue
    }
    for (const prim of mesh.primitives) {
      const attrs = prim.attributes
      const expressIdAcc = attrs?._EXPRESSID
      const indexAcc = prim.indices
      if (expressIdAcc === undefined || indexAcc === undefined) {
        perPrimitive.push(null)
        continue
      }
      const instanceIdAcc = attrs._INSTANCEID

      const indices = readAccessorAsUint32(json, bin, indexAcc)
      const expressIdsPerVertex = readAccessorAsUint32(json, bin, expressIdAcc)
      const instanceIdsPerVertex = instanceIdAcc !== undefined ?
        readAccessorAsUint32(json, bin, instanceIdAcc) :
        null
      if (!indices || !expressIdsPerVertex) {
        perPrimitive.push(null)
        continue
      }
      const triangleCount = (indices.length / 3) | 0
      const expressIds = new Uint32Array(triangleCount)
      const instanceIds = instanceIdsPerVertex ?
        new Uint32Array(triangleCount) :
        null
      for (let t = 0; t < triangleCount; t++) {
        const v0 = indices[t * 3]
        expressIds[t] = expressIdsPerVertex[v0]
        if (instanceIds) {
          instanceIds[t] = instanceIdsPerVertex[v0]
        }
      }
      perPrimitive.push({expressIds, instanceIds})
      captured++
    }
  }
  if (captured === 0) {
    return null
  }
  return {perPrimitive}
}


/**
 * Read an accessor's data as a typed Uint32 view over the BIN chunk.
 * Handles only the component types the writer emits — UNSIGNED_INT
 * (5125) for indices and our per-vertex IDs. Returns null on
 * unsupported / malformed accessors so the caller can skip the
 * primitive without aborting the whole capture.
 *
 * @param {object} json
 * @param {Uint8Array} bin
 * @param {number} accIdx
 * @return {Uint32Array|null}
 */
function readAccessorAsUint32(json, bin, accIdx) {
  const acc = json.accessors[accIdx]
  if (!acc || acc.bufferView === undefined) {
    return null
  }
  const COMPONENT_TYPE_UNSIGNED_INT = 5125
  if (acc.componentType !== COMPONENT_TYPE_UNSIGNED_INT) {
    return null
  }
  const bv = json.bufferViews[acc.bufferView]
  if (!bv) {
    return null
  }
  const ELEMENT_BYTES = 4
  const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0)
  // Slice bytes into a fresh ArrayBuffer for 4-byte alignment —
  // Uint32Array's constructor throws RangeError on a misaligned
  // offset within the source buffer.
  const sliceBytes = bin.subarray(offset, offset + (acc.count * ELEMENT_BYTES))
  const aligned = new Uint8Array(sliceBytes.byteLength)
  aligned.set(sliceBytes)
  return new Uint32Array(aligned.buffer)
}


/**
 * Pack a `capturePerTriangleIds` result into the wire JSON shape
 * that `injectGlbExtensions` consumes. Each primitive's typed-array
 * payloads are Base64-encoded so they fit the existing JSON+gzip
 * inject pipeline without API changes.
 *
 * @param {object} captured `{perPrimitive: [{expressIds, instanceIds}|null, ...]}`
 * @return {object|null} extension data ready for `injectGlbExtensions`
 */
export function buildFaceIdsExtensionData(captured) {
  if (!captured || !Array.isArray(captured.perPrimitive)) {
    return null
  }
  const perPrimitive = captured.perPrimitive.map((entry) => {
    if (!entry || !entry.expressIds) {
      return null
    }
    const out = {
      expressIds: uint32ArrayToBase64(entry.expressIds),
      length: entry.expressIds.length,
    }
    if (entry.instanceIds) {
      out.instanceIds = uint32ArrayToBase64(entry.instanceIds)
    }
    return out
  })
  return {perPrimitive}
}


/**
 * Base64-encode a Uint32Array for embedding in JSON. The underlying
 * byte buffer is little-endian (matches the WebGL / glTF convention).
 *
 * @param {Uint32Array} arr
 * @return {string}
 */
function uint32ArrayToBase64(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
  let binary = ''
  // String.fromCharCode trips on long arg lists — encode in 32KB chunks.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK)
    binary += String.fromCharCode.apply(null, slice)
  }
  return btoa(binary)
}


/**
 * Decode a Base64 string produced by `uint32ArrayToBase64` back to
 * a fresh Uint32Array.
 *
 * @param {string} b64
 * @return {Uint32Array}
 */
export function base64ToUint32Array(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const ELEMENT_BYTES = 4
  return new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / ELEMENT_BYTES)
}

