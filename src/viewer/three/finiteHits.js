/**
 * Drop raycast hits with a non-finite distance, and restore nearest-first
 * order among the rest.
 *
 * three r187 replaced `Ray.intersectTriangle` with a watertight
 * (Woop–Benthin–Wald) test. Its rejections are all `<`/`>`/`===`
 * comparisons, so a triangle with a NaN vertex — which real IFC exports do
 * carry (see the NaN-box case in `model/batchedInstanceBvh.test.js`) —
 * is no longer rejected: it "hits" at distance NaN, through three's own Mesh
 * raycast and three-mesh-bvh's alike (both call `intersectTriangle`).
 * r184's version returned null for it.
 *
 * Filtering alone isn't enough. `intersectObjects` has already sorted by
 * `a.distance - b.distance`, and a comparator that returns NaN is read as
 * "equal", which breaks transitivity, so the finite hits around a NaN one
 * can come out of that sort misordered. Re-sorting them restores the order
 * every pick caller assumes (`[0]` is nearest).
 *
 * @param {Array<{distance: number}>} hits as `Raycaster#intersectObjects`
 *   returns them
 * @return {Array<{distance: number}>} the finite hits, nearest first. The
 *   input array is returned as is when every hit is finite.
 */
export function finiteHits(hits) {
  if (hits.every((h) => Number.isFinite(h.distance))) {
    return hits
  }
  return hits.filter((h) => Number.isFinite(h.distance)).sort((a, b) => a.distance - b.distance)
}
