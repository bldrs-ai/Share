/**
 * MetaStream container framing (reverse engineered from Mts3Reader.dll;
 * freality `bio/med/dental/tools/mts/mts.py` has the reference parser).
 *
 *     '"mts'  uint32be version  '$$'  1 byte
 *     varint headerLength, header bytes
 *     repeat: varint chunkLength, then chunkLength bytes:
 *         varint typeId
 *         first time a typeId appears: varint defLength, then
 *           defLength bytes: flag, nameLength, name
 *         payload
 *
 * A varint's top 2 bits give the number of extra bytes (big-endian); the
 * low 6 bits are the most significant. A type's stream is the
 * concatenation of its chunks' payloads, and the first payload byte after
 * the type definition is an object index, not stream data.
 */


const MAGIC = [0x22, 0x6d, 0x74, 0x73] // '"mts'
const DOLLAR = 0x24


/**
 * @param {Uint8Array} buf
 * @param {number} pos
 * @return {Array<number>} [value, next position]
 */
function varint(buf, pos) {
  const b = buf[pos]
  const extra = b >> 6
  let v = b & 63
  for (let k = 0; k < extra; k++) {
    v = (v * 256) + buf[pos + 1 + k]
  }
  return [v, pos + 1 + extra]
}


/**
 * Split one MetaStream into its typed streams.
 *
 * @param {Uint8Array} buf
 * @param {number} [start] offset of the '"mts' magic
 * @return {Map<number, {name: string, objectIndex: number, bytes: Uint8Array}>}
 */
export function readStreams(buf, start = 0) {
  if (!MAGIC.every((b, k) => buf[start + k] === b) || buf[start + 8] !== DOLLAR || buf[start + 9] !== DOLLAR) {
    throw new Error('mts: not a MetaStream stream')
  }
  let pos = start + 11
  const [headerLength, afterLength] = varint(buf, pos)
  pos = afterLength + headerLength
  const parts = new Map()
  while (pos < buf.length) {
    const [length, body] = varint(buf, pos)
    const end = body + length
    let [typeId, p] = varint(buf, body)
    let entry = parts.get(typeId)
    if (!entry) {
      const [defLength, defStart] = varint(buf, p)
      const nameLength = buf[defStart + 1]
      const name = String.fromCharCode(...buf.subarray(defStart + 2, defStart + 2 + nameLength))
      p = defStart + defLength
      entry = {name, objectIndex: buf[p], chunks: []}
      parts.set(typeId, entry)
      p += 1
    }
    entry.chunks.push(buf.subarray(p, end))
    pos = end
  }
  const streams = new Map()
  for (const [typeId, {name, objectIndex, chunks}] of parts) {
    const size = chunks.reduce((n, c) => n + c.length, 0)
    const bytes = new Uint8Array(size)
    let off = 0
    for (const c of chunks) {
      bytes.set(c, off)
      off += c.length
    }
    streams.set(typeId, {name, objectIndex, bytes})
  }
  return streams
}


/**
 * The mesh bitstream inside an ADF `CompressedData` value (a uint32 size
 * prefix, then one MetaStream holding a single `mesh` stream).
 *
 * @param {Uint8Array} blob
 * @return {Uint8Array}
 */
export function meshPayloadFromCompressedData(blob) {
  const meshes = [...readStreams(blob, 4).values()].filter((s) => s.name === 'mesh')
  if (meshes.length !== 1) {
    throw new Error(`mts: expected one mesh stream, got ${meshes.length}`)
  }
  return meshes[0].bytes
}
