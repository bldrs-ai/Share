/**
 * geometryContentKey — intern `BufferGeometry` objects by the CONTENT of the
 * attributes the batched GLB writer serializes, so two objects holding the
 * same bytes are one shape rather than two.
 *
 * `glbBatchedExport` used to group on `geometry.uuid`, which is OBJECT
 * identity. The shapes it groups come from `makeInstanceGeometryReader`,
 * whose per-pass cache keys on conway's `geometryExpressID`
 * (`batchedInstanceGeometry.js#sourceKey`) — so two IFC types that happen to
 * produce byte-identical meshes arrive as two distinct objects and were
 * written twice. Measured on Snowdon (Share#1859): 12,251 groups over 7,178
 * distinct contents, costing 6,079,368 B of duplicated BIN plus ~5.9 MB of
 * JSON bookkeeping — 17.7% of the artifact, all of it lossless to remove.
 *
 * **The hash only buckets; byte equality decides.** A 32-bit hash over
 * thousands of shapes will collide at a percent-level rate, and a collision
 * here would draw the wrong geometry — so every candidate is compared byte
 * for byte before it is treated as the same shape. That makes the intern
 * exact rather than probabilistic, and it costs one full compare per REAL
 * duplicate (a few thousand memcmp-shaped loops over ~1 KB each) plus
 * essentially nothing for the misses.
 *
 * **Byte length is not enough to tell arrays apart**, which is why the
 * bucket key carries each array's `BYTES_PER_ELEMENT`: a `Uint16Array`
 * `[0, 1]` and a `Uint32Array` `[65536]` are the same four bytes and would
 * otherwise intern to one another, then serialize with different
 * `componentType`s.
 */


/** FNV-1a 32-bit offset basis / prime, over the attribute bytes. */
const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 16777619

/** Attributes this writer serializes, in the order they are hashed. */
const HASHED_ATTRIBUTES = ['position', 'normal']


/**
 * The typed arrays the writer would serialize for this geometry.
 *
 * @param {object} geometry BufferGeometry
 * @return {Array<object>|null} position, normal, index arrays, or null when
 *   the geometry is missing any of them
 */
function writtenArrays(geometry) {
  const arrays = []
  for (const name of HASHED_ATTRIBUTES) {
    const array = geometry?.getAttribute?.(name)?.array
    if (!array) {
      return null
    }
    arrays.push(array)
  }
  const index = geometry?.index?.array
  if (!index) {
    return null
  }
  arrays.push(index)
  return arrays
}


/**
 * A byte view of a typed array, without copying it.
 *
 * @param {object} array a TypedArray
 * @return {Uint8Array}
 */
function bytesOf(array) {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
}


/**
 * Bucket key: the shape of the arrays plus an FNV-1a hash of their bytes.
 *
 * @param {Array<object>} arrays from {@link writtenArrays}
 * @return {string}
 */
function bucketKey(arrays) {
  let hash = FNV_OFFSET_BASIS
  let shape = ''
  for (const array of arrays) {
    const bytes = bytesOf(array)
    for (let i = 0; i < bytes.length; i++) {
      hash = Math.imul(hash ^ bytes[i], FNV_PRIME)
    }
    shape += `${array.BYTES_PER_ELEMENT}:${array.length},`
  }
  return `${shape}${hash >>> 0}`
}


/**
 * Byte-for-byte equality over two geometries' written arrays.
 *
 * @param {Array<object>} a from {@link writtenArrays}
 * @param {Array<object>} b from {@link writtenArrays}
 * @return {boolean}
 */
function arraysEqual(a, b) {
  for (let k = 0; k < a.length; k++) {
    if (a[k].BYTES_PER_ELEMENT !== b[k].BYTES_PER_ELEMENT ||
        a[k].length !== b[k].length) {
      return false
    }
    const x = bytesOf(a[k])
    const y = bytesOf(b[k])
    for (let i = 0; i < x.length; i++) {
      if (x[i] !== y[i]) {
        return false
      }
    }
  }
  return true
}


/**
 * An interner mapping every geometry to the FIRST object seen carrying the
 * same bytes, so downstream dedup keyed on object identity becomes dedup on
 * content.
 *
 * A geometry the writer could not serialize anyway — no normals, no index —
 * is returned unchanged rather than interned: `isWritableGeometry` declines
 * the whole export on it a moment later, and hashing a shape the file will
 * never contain would only be able to merge two refusals.
 *
 * Scope it to one export pass: it retains every distinct shape it is shown,
 * which is the same set the accessor table already holds.
 *
 * @return {Function} `(geometry) => geometry` — the canonical object
 */
export function makeGeometryInterner() {
  const buckets = new Map()
  return (geometry) => {
    const arrays = writtenArrays(geometry)
    if (!arrays) {
      return geometry
    }
    const key = bucketKey(arrays)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
    }
    for (const candidate of bucket) {
      if (arraysEqual(candidate.arrays, arrays)) {
        return candidate.geometry
      }
    }
    bucket.push({geometry, arrays})
    return geometry
  }
}
