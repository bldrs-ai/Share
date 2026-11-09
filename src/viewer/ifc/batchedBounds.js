import {Box3, Sphere, Vector3} from 'three'


/**
 * Fill in every geometry's bounding box and sphere on a BatchedMesh, from
 * the batch's typed arrays, before three would compute them its own way.
 *
 * three r0.184 computes a geometry's box and sphere lazily, the first time
 * anything asks (`getBoundingBoxAt` / `getBoundingSphereAt`,
 * node_modules/three/src/objects/BatchedMesh.js:1070-1146), with two walks
 * over the geometry's draw range that read each corner through
 * `index.getX` and `Vector3#fromBufferAttribute`. `decorateBatchMeshes`
 * asks for all of them at once (`computeBoundingBox` +
 * `computeBoundingSphere`), and on PSB's GLB cache hit that was 0.62 s of
 * "Applying model fixups" (Share#2101).
 *
 * This does the same two walks over the same indices, reading the arrays
 * directly, and stores the results where three keeps its own
 * (`_geometryInfo[id].boundingBox` / `.boundingSphere`), so three's getters
 * find them and skip their walk. The values are three's, but for the sign
 * of a zero (a comparison keeps whichever of +0 and -0 came first, where
 * Math.min prefers -0; they are the same number): the box is
 * the component-wise min and max of the same float32 corners, the sphere is
 * centred on that box (the origin for an empty one, as `Box3#getCenter`
 * gives) with the square root of the largest squared distance, computed in
 * the same order. A geometry three already has bounds for (an edit's, or one
 * whose source geometry carried them) is left alone.
 *
 * Reaches into `_geometryInfo`, three's private table, as
 * batchedGeometryCapacity.js does; anything unexpected about it or the
 * batch geometry (no plain float32 xyz POSITION, an interleaved one) makes
 * this a no-op, and three's own lazy path takes over unchanged.
 *
 * @param {object} mesh THREE.BatchedMesh
 * @return {number} how many geometries were seeded
 */
export function seedBatchedGeometryBounds(mesh) {
  const infos = mesh?._geometryInfo
  const position = mesh?.geometry?.attributes?.position
  if (!Array.isArray(infos) || !isPlainFloat32Xyz(position)) {
    return 0
  }
  const pos = position.array
  const index = mesh.geometry.index
  const idx = index && ArrayBuffer.isView(index.array) && index.itemSize === 1 && !index.normalized ?
    index.array : null
  if (index && idx === null) {
    return 0
  }
  let seeded = 0
  for (const info of infos) {
    if (!info || info.active === false || (info.boundingBox !== null && info.boundingSphere !== null)) {
      continue
    }
    if (info.boundingBox === null) {
      info.boundingBox = boxOver(pos, idx, info.start, info.start + info.count)
    }
    if (info.boundingSphere === null) {
      info.boundingSphere = sphereOver(pos, idx, info.start, info.start + info.count, info.boundingBox)
    }
    seeded++
  }
  return seeded
}


const XYZ = 3
const HALF = 0.5


/**
 * The box over the corners `idx[start..end)` name (or `start..end` with no
 * index), as getBoundingBoxAt builds it.
 *
 * Plain comparisons rather than Box3#expandByPoint's Math.min/max, about a
 * third faster here, and the same box for every corner but a NaN (and the
 * sign of a zero, which is no difference in value): Math.min passes a NaN
 * on, a comparison skips it. So a NaN corner, which three's box
 * turns NaN, sends the geometry to {@link boxOverWithNaN}, which is three's
 * arithmetic exactly.
 *
 * @param {Float32Array} pos
 * @param {Uint32Array|Uint16Array|null} idx
 * @param {number} start
 * @param {number} end
 * @return {object} THREE.Box3
 */
function boxOver(pos, idx, start, end) {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  let sawNaN = false
  for (let i = start; i < end; i++) {
    const at = (idx ? idx[i] : i) * XYZ
    const x = pos[at]
    const y = pos[at + 1]
    const z = pos[at + 2]
    if (x < minX) {
      minX = x
    }
    if (x > maxX) {
      maxX = x
    }
    if (y < minY) {
      minY = y
    }
    if (y > maxY) {
      maxY = y
    }
    if (z < minZ) {
      minZ = z
    }
    if (z > maxZ) {
      maxZ = z
    }
    // A NaN fails every comparison above; `v !== v` is how to see one.
    if (x !== x || y !== y || z !== z) {
      sawNaN = true
    }
  }
  if (sawNaN) {
    return boxOverWithNaN(pos, idx, start, end)
  }
  return new Box3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ))
}


/**
 * {@link boxOver} with three's own Math.min/max, for a geometry with a NaN
 * corner, so its box is poisoned exactly as three's is.
 *
 * @param {Float32Array} pos
 * @param {Uint32Array|Uint16Array|null} idx
 * @param {number} start
 * @param {number} end
 * @return {object} THREE.Box3
 */
function boxOverWithNaN(pos, idx, start, end) {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = start; i < end; i++) {
    const at = (idx ? idx[i] : i) * XYZ
    minX = Math.min(minX, pos[at])
    minY = Math.min(minY, pos[at + 1])
    minZ = Math.min(minZ, pos[at + 2])
    maxX = Math.max(maxX, pos[at])
    maxY = Math.max(maxY, pos[at + 1])
    maxZ = Math.max(maxZ, pos[at + 2])
  }
  return new Box3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ))
}


/**
 * The sphere getBoundingSphereAt builds: centred on `box` (the origin for an
 * empty box, as Box3#getCenter gives), out to the farthest of the same
 * corners, with the squared distance summed in Vector3#distanceToSquared's
 * order. A comparison stands in for its Math.max, as in {@link boxOver}; a
 * NaN distance, which Math.max would carry to the end, makes the radius NaN
 * as it does in three.
 *
 * @param {Float32Array} pos
 * @param {Uint32Array|Uint16Array|null} idx
 * @param {number} start
 * @param {number} end
 * @param {object} box THREE.Box3, the geometry's box
 * @return {object} THREE.Sphere
 */
function sphereOver(pos, idx, start, end, box) {
  const center = box.isEmpty() ? new Vector3() :
    new Vector3().addVectors(box.min, box.max).multiplyScalar(HALF)
  const cx = center.x
  const cy = center.y
  const cz = center.z
  let maxRadiusSq = 0
  let sawNaN = false
  for (let i = start; i < end; i++) {
    const at = (idx ? idx[i] : i) * XYZ
    const dx = cx - pos[at]
    const dy = cy - pos[at + 1]
    const dz = cz - pos[at + 2]
    const distanceSq = (dx * dx) + (dy * dy) + (dz * dz)
    if (distanceSq > maxRadiusSq) {
      maxRadiusSq = distanceSq
    }
    if (distanceSq !== distanceSq) {
      sawNaN = true
    }
  }
  return new Sphere(center, sawNaN ? NaN : Math.sqrt(maxRadiusSq))
}


/**
 * @param {object} attribute
 * @return {boolean}
 */
function isPlainFloat32Xyz(attribute) {
  return Boolean(attribute) && !attribute.isInterleavedBufferAttribute && !attribute.normalized &&
    attribute.itemSize === XYZ && attribute.array instanceof Float32Array
}
