/**
 * subsetMaterialGroups — preserve per-material `geometry.groups` when
 * filtering a multi-material source geometry down to a subset.
 *
 * The Conway-direct assembler (`src/viewer/ifc/flatMeshToBufferGeometry.js`)
 * merges a model into a single BufferGeometry whose triangles are emitted
 * in *color-bin order*: one `geometry.groups[]` entry per bin, paired
 * positionally with one entry in the mesh's `material` array. A subset
 * built from that geometry inherits the array material, so unless it
 * carries its own `groups[]` three.js has nothing to render against —
 * `WebGLRenderer.projectObject` walks `geometry.groups` when the material
 * is an array and pushes NOTHING when that array is empty (r184
 * three.module.js ~line 17842). That is the render-skip bug behind
 * "isolated elements disappear".
 *
 * The historical stop-gap was `addGroup(0, wholeIndexBuffer, 0)`: visible,
 * but every triangle drawn with `material[0]` — i.e. monochrome, and grey
 * whenever bin 0 is the DEFAULT_COLOR bin (Share#1806). This module does
 * the real thing: map each kept triangle back to the source group it came
 * from, then emit coalesced destination groups so each run of triangles
 * renders with its own bin's material.
 *
 * Both subset builders (`elementSubsets.buildSubsetMesh` and
 * `IfcInstanceMap`'s `buildSubsetMesh`) copy triangles in **ascending
 * source-triangle order**, which is what keeps the destination group count
 * at one-per-material-bin instead of one-per-triangle. Callers that gather
 * triangles out of order (the instance-map path walks per-instance lists)
 * must sort before copying — see `createSubsetMeshByInstance`.
 */


/**
 * Sentinel returned by the indexer for a triangle that no source group
 * covers (a gap between groups, or a triangle past the last group).
 * Callers treat it as "can't attribute this run" and fall back.
 */
export const UNKNOWN_MATERIAL_INDEX = -1


const INDICES_PER_TRIANGLE = 3


/**
 * Build a source-triangle → material-index lookup from `srcGeom.groups`.
 *
 * `group.start` / `group.count` are in *index-buffer* units, so a group
 * covers triangles `[start / 3, (start + count) / 3)`. The returned
 * function keeps a cursor and is O(1) amortised for monotonically
 * non-decreasing queries (the copy-loop access pattern); it stays
 * correct — just slower — for out-of-order ones by rewinding.
 *
 * @param {object} srcGeom source BufferGeometry
 * @return {?function(number): number} triangle index → material index,
 *   or `UNKNOWN_MATERIAL_INDEX`. Null when the geometry carries no
 *   groups at all (single-material source — nothing to preserve).
 */
export function makeTriangleMaterialIndexer(srcGeom) {
  const groups = srcGeom && srcGeom.groups
  if (!groups || groups.length === 0) {
    return null
  }
  // Copy before sorting: `geometry.groups` is the live array three.js
  // renders from, and the assembler's emission order is load-bearing
  // elsewhere. Sorting is defensive — the assembler already emits in
  // ascending order — but a GLB round-trip or a hand-built geometry
  // need not.
  const ranges = groups
    .map((g) => ({
      startTri: g.start / INDICES_PER_TRIANGLE,
      endTri: (g.start + g.count) / INDICES_PER_TRIANGLE,
      materialIndex: g.materialIndex ?? 0,
    }))
    .sort((a, b) => a.startTri - b.startTri)
  let cursor = 0
  return (t) => {
    if (cursor >= ranges.length || t < ranges[cursor].startTri) {
      cursor = 0
    }
    while (cursor < ranges.length && t >= ranges[cursor].endTri) {
      cursor++
    }
    if (cursor >= ranges.length || t < ranges[cursor].startTri) {
      return UNKNOWN_MATERIAL_INDEX
    }
    return ranges[cursor].materialIndex
  }
}


/**
 * Settle a subset mesh's material and, when it stays an array, give the
 * destination geometry the `groups[]` three.js needs to draw it.
 *
 * Behaviour by material shape:
 *  - not an array → returned unchanged (an explicit single-material
 *    override, the common highlight case). No groups needed.
 *  - `Array(1)` → unwrapped to the scalar, so the renderer takes its
 *    `material.visible` branch rather than the group walk. This is the
 *    monochrome-model cache-hit path.
 *  - `Array(N > 1)` → kept as an array, with one destination group per
 *    coalesced run of same-material triangles. Falls back to a single
 *    whole-buffer group pointing at `material[0]` when the per-triangle
 *    material indices are unavailable or don't fit this array (see
 *    below) — visible-but-monochrome beats invisible.
 *
 * The fallback also covers the case where an array `opts.material`
 * override is not the source mesh's own material array: the indices
 * come from the source geometry's groups and only mean anything against
 * the array they were binned into, so an out-of-range index is treated
 * as "these indices aren't for this array".
 *
 * @param {object} dstGeom destination BufferGeometry (already indexed)
 * @param {object|Array<object>} material subset material candidate
 * @param {?(Array<number>|Int32Array)} triangleMaterialIndices one entry
 *   per destination triangle, in destination order
 * @return {object|Array<object>} material to assign to the subset Mesh
 */
export function resolveSubsetMaterial(dstGeom, material, triangleMaterialIndices) {
  if (!Array.isArray(material)) {
    return material
  }
  if (material.length === 1) {
    return material[0]
  }
  if (material.length === 0) {
    return material
  }
  const dstIndex = dstGeom.getIndex()
  const dstIndexCount = dstIndex ? dstIndex.count : 0
  const dstTriangleCount = dstIndexCount / INDICES_PER_TRIANGLE
  const usable =
    triangleMaterialIndices !== null &&
    triangleMaterialIndices !== undefined &&
    triangleMaterialIndices.length === dstTriangleCount &&
    dstTriangleCount > 0
  if (usable) {
    let runStart = 0
    let runMaterial = triangleMaterialIndices[0]
    let ok = true
    // One extra iteration past the end flushes the final run.
    for (let t = 0; t <= dstTriangleCount; t++) {
      const current = t < dstTriangleCount ? triangleMaterialIndices[t] : UNKNOWN_MATERIAL_INDEX
      if (t < dstTriangleCount && (current < 0 || current >= material.length)) {
        ok = false
        break
      }
      if (t === dstTriangleCount || current !== runMaterial) {
        dstGeom.addGroup(
          runStart * INDICES_PER_TRIANGLE,
          (t - runStart) * INDICES_PER_TRIANGLE,
          runMaterial,
        )
        runStart = t
        runMaterial = current
      }
    }
    if (ok) {
      return material
    }
    // Partial groups may have been emitted before the bad index was
    // seen; drop them so the whole-buffer fallback is the only group.
    dstGeom.clearGroups()
  }
  dstGeom.addGroup(0, dstIndexCount, 0)
  return material
}
