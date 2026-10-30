/**
 * Byte-level checks on what a live export hands the user, and on the OPFS
 * cache artifact behind it. Free of any Playwright import, for
 * `glbBytes.test.js`.
 */


export const GLTF_MAGIC = 'glTF'
const GLB_VERSION = 2
const GLB_HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const JSON_CHUNK_TYPE = 0x4E4F534A // "JSON" LE
const BIN_CHUNK_TYPE = 0x004E4942 // "BIN\0" LE
const CHUNK_ALIGNMENT = 4
const GZIP_ID1 = 0x1F
const GZIP_ID2 = 0x8B
// The Bldrs OPFS container (src/loader/glbContainer.js "Wire format").
const CONTAINER_MAGIC = 'BLDR'
const CONTAINER_HEADER_BYTES = 16
const CONTAINER_VERSION_OFFSET = 4
const CONTAINER_CODEC_OFFSET = 13


/**
 * Everything wrong with a file that claims to be a binary glTF, judged from
 * its framing alone: the 12-byte header, and the chunk headers that must
 * tile the rest of the file exactly. "First 4 bytes are glTF" (§8 step 2) is
 * the start of this; a truncated download, a container that leaked out, or a
 * length field that disagrees with the file all pass that test and fail
 * this one.
 *
 * @param bytes the downloaded file
 * @return problems, empty when the framing is sound
 */
export function glbFramingProblems(bytes: Uint8Array): string[] {
  if (bytes.byteLength < GLB_HEADER_BYTES + CHUNK_HEADER_BYTES) {
    return [`${bytes.byteLength} bytes is too short for a GLB`]
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = String.fromCharCode(...bytes.subarray(0, GLTF_MAGIC.length))
  if (magic !== GLTF_MAGIC) {
    return [`magic is ${JSON.stringify(magic)}, not "glTF"`]
  }
  const problems: string[] = []
  const version = view.getUint32(4, true)
  if (version !== GLB_VERSION) {
    problems.push(`version is ${version}, not 2`)
  }
  const declared = view.getUint32(8, true)
  if (declared !== bytes.byteLength) {
    problems.push(`header says ${declared} bytes, file is ${bytes.byteLength}`)
  }
  let offset = GLB_HEADER_BYTES
  let index = 0
  while (offset < bytes.byteLength) {
    if (offset + CHUNK_HEADER_BYTES > bytes.byteLength) {
      problems.push(`chunk ${index} header runs past the end`)
      break
    }
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    if (index === 0 && type !== JSON_CHUNK_TYPE) {
      problems.push('first chunk is not JSON')
    }
    if (index === 1 && type !== BIN_CHUNK_TYPE) {
      problems.push('second chunk is not BIN')
    }
    if (length % CHUNK_ALIGNMENT !== 0) {
      problems.push(`chunk ${index} length ${length} is not 4-byte aligned`)
    }
    offset += CHUNK_HEADER_BYTES + length
    if (offset > bytes.byteLength) {
      problems.push(`chunk ${index} runs past the end`)
    }
    index++
  }
  return problems
}


/**
 * The JSON chunk as text, padding trimmed. Read the RAW text rather than
 * only the parsed object when looking for `BLDRS_`: a stripped export must
 * not mention it anywhere, keys and values alike (§8 step 5's
 * `strings file.glb | grep BLDRS_`).
 *
 * @param bytes a GLB with sound framing
 * @return the JSON chunk's text
 */
export function glbJsonText(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = view.getUint32(GLB_HEADER_BYTES, true)
  const start = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES
  return new TextDecoder().decode(bytes.subarray(start, start + length)).replace(/\s+$/, '')
}


/**
 * @param bytes any file
 * @return whether it starts as a gzip stream does
 */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 2 && bytes[0] === GZIP_ID1 && bytes[1] === GZIP_ID2
}


/**
 * The version and codec of a Bldrs OPFS container, from its first 16 bytes:
 * v3 + gzip where the engine has `CompressionStream`, v2 + none where it
 * does not (glbContainer.js#packGlbChunks). §8 step 9's fallback is exactly
 * "this reads v2".
 *
 * @param head at least the first 16 bytes of the file
 * @return null when it is not a container
 */
export function containerHeader(head: Uint8Array): {version: number, codec: 'gzip' | 'none' | null} | null {
  if (head.byteLength < CONTAINER_HEADER_BYTES ||
      String.fromCharCode(...head.subarray(0, CONTAINER_MAGIC.length)) !== CONTAINER_MAGIC) {
    return null
  }
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  const version = view.getUint32(CONTAINER_VERSION_OFFSET, true)
  const V3 = 3
  if (version !== V3) {
    return {version, codec: null}
  }
  return {version, codec: head[CONTAINER_CODEC_OFFSET] === 1 ? 'gzip' : 'none'}
}
