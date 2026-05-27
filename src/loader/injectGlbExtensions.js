// Post-process raw GLB bytes from GLTFExporter to inject custom
// glTF top-level extensions whose payloads live in the binary chunk.
//
// We use GLTFExporter's output verbatim (geometry, materials, textures,
// scene graph) and then splice in extra bufferViews + extension entries.
// Going through this route — rather than writing a GLTFExporter plugin —
// keeps the geometry-export path identical to what we ship today and
// confines the extension write logic to one well-tested seam.
//
// Why "one seam, not a GLTFExporter plugin": GLTFExporter's plugin API
// exposes per-{node,mesh,material} write hooks but its top-level extension
// surface (`writer.extensionsUsed`, `writer.json.extensions`) is sparsely
// documented and tightly coupled to write order — adding a bufferView from
// a plugin requires reaching into `writer.processBufferView` after the
// main parse, which is fragile across three.js versions. Post-processing
// the canonical GLB wire format is version-stable.
//
// On-disk layout of a glTF 2.0 binary (".glb"), little-endian throughout:
//   0..3   magic     u32  0x46546C67  "glTF"
//   4..7   version   u32  2
//   8..11  length    u32  total file length
//   12..15 jChunkLen u32  byteLength of JSON chunk DATA (padded internally)
//   16..19 jChunkTyp u32  0x4E4F534A  "JSON"
//   20..   jChunkDat utf-8 JSON, padded with 0x20 (space) to multiple of 4
//   ...    bChunkLen u32  byteLength of BIN chunk DATA (padded internally)
//   +4     bChunkTyp u32  0x004E4942  "BIN\0"
//   +8     bChunkDat raw  buffer bytes, padded with 0x00 to multiple of 4
//
// glTF requires `buffers[0].byteLength` to equal the BIN chunk's unpadded
// data length — chunk-level zero padding does NOT count toward it. Each
// new bufferView's `byteOffset` is set to a 4-byte boundary within the
// buffer; the spec only requires alignment for accessor-typed bufferViews
// but enforcing it everywhere keeps any future accessor reuse safe.
import * as pako from 'pako'
import {glbInfo} from './glbLog'


const GLB_MAGIC = 0x46546C67 // "glTF" LE
const GLB_VERSION = 2
const GLB_HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const JSON_CHUNK_TYPE = 0x4E4F534A // "JSON" LE
const BIN_CHUNK_TYPE = 0x004E4942 // "BIN\0" LE
const HEX_RADIX = 16


/**
 * Round a byte length up to the next multiple of 4.
 *
 * @param {number} n
 * @return {number}
 */
function pad4(n) {
  return (n + 3) & ~3
}


/**
 * Parse a GLB binary into its constituent JSON document + binary chunk.
 * Throws when the input is not a well-formed GLB; callers wrap the call
 * in try/catch when the input may be a non-GLB blob (e.g. our Bldrs
 * container wrapper at a different layer).
 *
 * @param {Uint8Array} bytes
 * @return {object} `{json: object, bin: Uint8Array|null}` — the BIN
 *   chunk is null when the source GLB had no binary chunk (rare but
 *   spec-legal; geometry-only-via-URI).
 */
export function parseGlb(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('parseGlb: input must be a Uint8Array')
  }
  if (bytes.byteLength < GLB_HEADER_BYTES) {
    throw new Error(`parseGlb: too short (${bytes.byteLength}B < header ${GLB_HEADER_BYTES}B)`)
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = dv.getUint32(0, true)
  if (magic !== GLB_MAGIC) {
    throw new Error(`parseGlb: bad magic 0x${magic.toString(HEX_RADIX)} (expected 0x${GLB_MAGIC.toString(HEX_RADIX)})`)
  }
  const version = dv.getUint32(4, true)
  if (version !== GLB_VERSION) {
    throw new Error(`parseGlb: unsupported version ${version} (expected ${GLB_VERSION})`)
  }
  const totalLen = dv.getUint32(8, true)
  if (totalLen > bytes.byteLength) {
    throw new Error(`parseGlb: header length ${totalLen} exceeds buffer ${bytes.byteLength}`)
  }

  // JSON chunk (required, must be first per spec).
  let offset = GLB_HEADER_BYTES
  const jLen = dv.getUint32(offset, true)
  const jType = dv.getUint32(offset + 4, true)
  if (jType !== JSON_CHUNK_TYPE) {
    throw new Error(`parseGlb: first chunk is not JSON (got 0x${jType.toString(HEX_RADIX)})`)
  }
  const jStart = offset + CHUNK_HEADER_BYTES
  const jEnd = jStart + jLen
  const jsonText = new TextDecoder('utf-8').decode(bytes.subarray(jStart, jEnd))
  // Strip trailing 0x20 padding before parsing (some decoders tolerate
  // it, but JSON.parse on whitespace-after-EOF is implementation-
  // specific in older runtimes).
  const json = JSON.parse(jsonText.replace(/\s+$/, ''))
  offset = jEnd

  // BIN chunk (optional per spec; absent means embedded data URIs only).
  let bin = null
  if (offset < totalLen) {
    const bLen = dv.getUint32(offset, true)
    const bType = dv.getUint32(offset + 4, true)
    if (bType !== BIN_CHUNK_TYPE) {
      throw new Error(`parseGlb: second chunk is not BIN (got 0x${bType.toString(HEX_RADIX)})`)
    }
    const bStart = offset + CHUNK_HEADER_BYTES
    // The authoritative data length is buffers[0].byteLength (per spec);
    // bLen rounds up to a 4-byte chunk boundary. Slice to the authoritative
    // length so we don't drag trailing zero padding into our new buffer.
    const authLen = json?.buffers?.[0]?.byteLength ?? bLen
    bin = bytes.subarray(bStart, bStart + authLen)
  }

  return {json, bin}
}


/**
 * Serialize a {json, bin} pair into a GLB binary. Inverse of parseGlb.
 *
 * @param {object} json
 * @param {Uint8Array|null} bin
 * @return {Uint8Array}
 */
export function serializeGlb(json, bin) {
  const jsonText = JSON.stringify(json)
  // JSON chunk data is padded to 4 bytes with 0x20 (space); the GLB spec
  // requires this so the chunk header that follows lands on alignment.
  const jsonBytes = new TextEncoder().encode(jsonText)
  const jsonPad = pad4(jsonBytes.length) - jsonBytes.length
  const jsonChunkLen = jsonBytes.length + jsonPad

  const hasBin = bin && bin.byteLength > 0
  const binPad = hasBin ? pad4(bin.byteLength) - bin.byteLength : 0
  const binChunkLen = hasBin ? bin.byteLength + binPad : 0

  const totalLen = GLB_HEADER_BYTES +
                   CHUNK_HEADER_BYTES + jsonChunkLen +
                   (hasBin ? CHUNK_HEADER_BYTES + binChunkLen : 0)

  const out = new Uint8Array(totalLen)
  const dv = new DataView(out.buffer)
  let p = 0
  dv.setUint32(p, GLB_MAGIC, true); p += 4
  dv.setUint32(p, GLB_VERSION, true); p += 4
  dv.setUint32(p, totalLen, true); p += 4

  // JSON chunk header + data + space padding.
  dv.setUint32(p, jsonChunkLen, true); p += 4
  dv.setUint32(p, JSON_CHUNK_TYPE, true); p += 4
  out.set(jsonBytes, p); p += jsonBytes.length
  for (let i = 0; i < jsonPad; i++) {
    out[p++] = 0x20
  }

  // BIN chunk header + data + zero padding (zero-fill is implicit from
  // Uint8Array init, no explicit loop needed).
  if (hasBin) {
    dv.setUint32(p, binChunkLen, true); p += 4
    dv.setUint32(p, BIN_CHUNK_TYPE, true); p += 4
    out.set(bin, p); p += bin.byteLength
    p += binPad
  }

  return out
}


/**
 * Inject one or more named top-level glTF extensions into a GLB. Each
 * extension's payload is serialized to JSON (and optionally gzipped),
 * appended to the GLB's binary chunk as a new bufferView, and recorded
 * under the extension name with `{compressed, bufferView}` shape so the
 * reader plugin can find it.
 *
 * On-disk shape per extension after injection:
 *   json.extensions[name]      = {compressed: <bool>, bufferView: <int>}
 *   json.extensionsUsed       += [name]   (idempotent)
 *   json.bufferViews          += [{buffer: 0, byteOffset, byteLength}]
 *   json.buffers[0].byteLength += pad4(payload bytes)
 *
 * The reader counterpart for each extension lives next to the writer
 * helper that produces it (e.g. src/loader/bldrsSpatialTree.js exports
 * both `captureBldrsSpatialTree` and `BldrsSpatialTreeReader`).
 *
 * Pass-through behavior: when `extensions` is empty AND `sceneExtras`
 * is empty/null, the input bytes are returned unmodified (and
 * `stats.addedExtensions === 0`) — the caller can unconditionally
 * route GLBs through this helper without paying a re-serialise cost
 * when nothing is being injected.
 *
 * Collision behavior: an extension whose `name` is already present in
 * `json.extensions` is **skipped** — we log a warning and leave the
 * existing entry intact rather than overwrite (which would orphan the
 * old bufferView in the file). Today's writer only injects on fresh
 * GLTFExporter output so this branch is defensive; it matters once
 * we start handling user-originated GLBs.
 *
 * **sceneExtras**: callers can also stamp small string-keyed metadata
 * into `json.scenes[json.scene ?? 0].extras` in the same pass. Used
 * for tiny payloads where a full `BLDRS_*` extension would be
 * overkill (e.g. the IFC project title — see `glbExport.js`'s
 * `BLDRS_TITLE_EXTRAS_KEY`). three.js GLTFLoader auto-copies scene
 * extras into `scene.userData`, so no reader plugin is needed.
 * Existing extras keys are preserved; provided keys merge in (and
 * overwrite on collision — keep keys disjoint across callers if you
 * don't want last-write-wins behavior). If `sceneExtras` is the only
 * non-empty input, we still parse+serialize so the new keys land in
 * the output.
 *
 * @param {Uint8Array} glbBytes
 * @param {Array} extensions list of `{name: string, data: object|null|undefined, compress?: boolean}`
 * @param {object} [sceneExtras] optional `{key: value, ...}` to merge
 *   into `scenes[json.scene ?? 0].extras`. Each value must be a
 *   JSON-serialisable scalar / object; entries with `null`/`undefined`
 *   values are skipped (so callers can opt-out per-key by passing nullish).
 * @return {{
 *   bytes: Uint8Array,
 *   stats: {
 *     addedExtensions: number,
 *     addedBinBytes: number,
 *     addedSceneExtras: number,
 *     skippedNames: Array<string>,
 *   },
 * }} `bytes` is the modified GLB (or the input unchanged in pass-through);
 *   `stats` describes what changed so callers can log delta metrics
 *   without inspecting the byte stream.
 */
export function injectGlbExtensions(glbBytes, extensions, sceneExtras) {
  const active = (extensions ?? []).filter((e) => e && e.data !== null && e.data !== undefined)
  const sceneExtraEntries = sceneExtras ?
    Object.entries(sceneExtras).filter(([, v]) => v !== null && v !== undefined) :
    []
  if (active.length === 0 && sceneExtraEntries.length === 0) {
    return {
      bytes: glbBytes,
      stats: {addedExtensions: 0, addedBinBytes: 0, addedSceneExtras: 0, skippedNames: []},
    }
  }

  const {json, bin} = parseGlb(glbBytes)

  // Stamp scene.extras BEFORE the bufferView-appending path so we
  // can early-return cleanly when only sceneExtras was provided.
  // `json.scene` is the default-scene index; per glTF spec it's
  // optional but conventionally 0 when present. Fall back to scene 0
  // for the (extremely rare) GLBs that omit the field.
  let addedSceneExtras = 0
  if (sceneExtraEntries.length > 0) {
    const sceneIdx = (typeof json.scene === 'number') ? json.scene : 0
    if (Array.isArray(json.scenes) && json.scenes[sceneIdx]) {
      json.scenes[sceneIdx].extras = json.scenes[sceneIdx].extras ?? {}
      for (const [key, value] of sceneExtraEntries) {
        json.scenes[sceneIdx].extras[key] = value
        addedSceneExtras++
      }
    } else {
      // Spec-legal but degenerate: a GLB with no scenes array has no
      // place to attach scene-level metadata. Skip silently — the
      // sceneExtras path is best-effort metadata; failure to stamp
      // must not block the rest of the inject.
      glbInfo(
        'injectGlbExtensions: sceneExtras provided but no scenes[] array; ' +
        'skipping scene-level metadata stamp')
    }
  }

  // We always reference buffer 0 (the implicit GLB BIN chunk). If the
  // input had no BIN chunk (geometry-only-via-URI is rare in practice
  // but legal), we synthesise one. The buffers[] entry is similarly
  // created on demand.
  json.buffers = json.buffers ?? []
  if (json.buffers.length === 0) {
    json.buffers.push({byteLength: 0})
  }
  json.bufferViews = json.bufferViews ?? []
  json.extensions = json.extensions ?? {}
  json.extensionsUsed = json.extensionsUsed ?? []

  // Filter out extensions whose name is already present in the JSON's
  // `extensions` map. Overwriting would silently orphan the existing
  // bufferView (still in the file, no entry references it) — that's a
  // silent corruption path on round-tripping a GLB that already carried
  // an earlier `BLDRS_*` payload. Surface it as a warning and skip.
  const skippedNames = []
  const toInject = []
  for (const ext of active) {
    if (json.extensions[ext.name] !== undefined) {
      skippedNames.push(ext.name)
      glbInfo(
        `injectGlbExtensions: ${ext.name} already present; skipping ` +
        '(overwriting would orphan the existing bufferView)')
      continue
    }
    toInject.push(ext)
  }
  if (toInject.length === 0) {
    // No top-level extensions to add. If sceneExtras was the only
    // input, the JSON mutation above already happened — we still need
    // to serialise. Otherwise return the input bytes unchanged.
    if (addedSceneExtras > 0) {
      return {
        bytes: serializeGlb(json, bin),
        stats: {addedExtensions: 0, addedBinBytes: 0, addedSceneExtras, skippedNames},
      }
    }
    return {
      bytes: glbBytes,
      stats: {addedExtensions: 0, addedBinBytes: 0, addedSceneExtras: 0, skippedNames},
    }
  }

  // Lay out additions starting at the next 4-byte boundary after the
  // existing buffer data. Each addition is itself padded to 4 bytes so
  // subsequent bufferViews stay aligned. Track two cursors:
  //   `nextOffset` — 4-aligned, where the *next* bufferView would start
  //   `dataEnd`    — unpadded end of the *last* bufferView's data
  // Both are needed downstream: `nextOffset` sizes the BIN chunk we
  // hand to `serializeGlb`; `dataEnd` is the value written to
  // `buffers[0].byteLength` (per glTF spec, the buffer's logical length
  // is its data, not its alignment-padded extent — the chunk header
  // carries the latter).
  let nextOffset = pad4(json.buffers[0].byteLength)
  let dataEnd = nextOffset
  const additions = []
  for (const {name, data, compress = true} of toInject) {
    const jsonText = JSON.stringify(data)
    const raw = new TextEncoder().encode(jsonText)
    const payload = compress ? pako.gzip(raw) : raw
    additions.push({name, payload, byteOffset: nextOffset, compressed: compress})
    dataEnd = nextOffset + payload.byteLength
    nextOffset += pad4(payload.byteLength)
  }

  // Build the new BIN at the padded size so trailing zeros stay inside
  // the binary chunk; serializeGlb's chunk-level pad-to-4 then becomes
  // a no-op rather than re-pad. Original data goes first; each addition
  // lands at its assigned (4-aligned) offset, with intermediate padding
  // bytes implicit zero from the Uint8Array init.
  const oldLen = bin ? bin.byteLength : 0
  const newBin = new Uint8Array(nextOffset)
  if (bin) {
    newBin.set(bin, 0)
  }
  for (const {payload, byteOffset} of additions) {
    newBin.set(payload, byteOffset)
  }

  // Update JSON metadata. We point each new bufferView's byteLength at
  // the payload (gzipped bytes), not the original JSON length — the
  // reader decompresses by exactly this many bytes.
  json.buffers[0].byteLength = dataEnd
  for (const {name, payload, byteOffset, compressed} of additions) {
    const bvIndex = json.bufferViews.length
    json.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: payload.byteLength,
    })
    json.extensions[name] = {compressed, bufferView: bvIndex}
    if (!json.extensionsUsed.includes(name)) {
      json.extensionsUsed.push(name)
    }
  }

  return {
    bytes: serializeGlb(json, newBin),
    stats: {
      addedExtensions: additions.length,
      addedBinBytes: nextOffset - oldLen,
      addedSceneExtras,
      skippedNames,
    },
  }
}
