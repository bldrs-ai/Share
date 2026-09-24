/**
 * Reader for `*.meshes.bin`: decoded CompressedQedge tooth surfaces written
 * by tools/mts/build_meshes.py (format documented there). No Three.js dependency.
 */

export const MESH_KIND_CROWN = 0
export const MESH_KIND_INITIAL = 1

/**
 * @param {ArrayBuffer|Uint8Array} input
 * @return {Array<{toothId:number, kind:number, min:number[], max:number[],
 *   positions:Float32Array, indices:Uint16Array|Uint32Array}>} positions in metres
 */
export function parseMeshSidecar(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = String.fromCharCode(...bytes.subarray(0, 4))
  if (magic !== 'ADFM') {
    throw new Error('not an ADF mesh sidecar')
  }
  const version = dv.getUint32(4, true)
  if (version !== 1) {
    throw new Error(`unsupported mesh sidecar version ${version}`)
  }
  const count = dv.getUint32(8, true)
  const meshes = []
  let pos = 12
  for (let m = 0; m < count; m++) {
    const toothId = dv.getInt32(pos, true)
    const kind = dv.getUint32(pos + 4, true)
    const nv = dv.getUint32(pos + 8, true)
    const nf = dv.getUint32(pos + 12, true)
    const min = readVec3(dv, pos + 16)
    const max = readVec3(dv, pos + 28)
    pos += 40
    const positions = new Float32Array(nv * 3)
    for (let i = 0; i < nv * 3; i++) {
      const a = i % 3
      positions[i] = min[a] + (dv.getUint16(pos + 2 * i, true) / 65535) * (max[a] - min[a])
    }
    pos += nv * 6
    const wide = nv > 65535
    const indices = wide ? new Uint32Array(nf * 3) : new Uint16Array(nf * 3)
    for (let i = 0; i < nf * 3; i++) {
      indices[i] = wide ? dv.getUint32(pos + 4 * i, true) : dv.getUint16(pos + 2 * i, true)
    }
    pos += nf * 3 * (wide ? 4 : 2)
    pos += (4 - (pos % 4)) % 4
    meshes.push({toothId, kind, min, max, positions, indices})
  }
  return meshes
}


/**
 * @param {DataView} dv
 * @param {number} offset
 * @return {Array<number>} three little-endian float32s
 */
function readVec3(dv, offset) {
  return [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)]
}
