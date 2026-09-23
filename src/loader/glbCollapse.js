import {Box3, Matrix3, Vector3} from 'three'
import {makeRangeCanary} from './bldrsInstanceTables'


/**
 * glbCollapse — merge the batched writer's single-placement groups into one
 * primitive per source colour, addressed by per-element index ranges
 * (share-140 #1871, glb-export-premium.md §1.1d). The WRITER half; the
 * reader is `viewer/ifc/batchedGeometryRanges.js` (#1870).
 *
 * Why: on a DSA-shaped model every element is its own glTF node + mesh +
 * accessors over a three-vertex shape, and that declaration is ~99.99% of the
 * JSON chunk (§1.1c). Collapsing replaces it with one mesh per colour.
 *
 * Three glTF facts decide the shape, and each one is a rule below:
 *
 * 1. **A primitive is drawn at one transform**, so each element's placement
 *    is BAKED into its vertices — otherwise any viewer that does not read
 *    `BLDRS_instance_tables` draws every element at the group's origin. The
 *    group's own offset (the centre of its bounds) stays on the NODE, so
 *    vertices are small numbers relative to the group: a model 10^5 m from
 *    the origin keeps millimetre detail in float32, where baking against the
 *    world origin would quantise it to centimetres.
 * 2. **A primitive has one material**, so merging is per source colour.
 * 3. **Only single-placement groups merge.** A group with several placements
 *    is genuine instancing, and merging it would write its geometry once per
 *    placement — 7× on a DSA-shaped model against ~6% on a Snowdon-shaped one
 *    is exactly that asymmetry. Those groups keep `EXT_mesh_gpu_instancing`,
 *    so a real artifact is HYBRID and the reader discriminates per table.
 *
 * **Row order is the contract, again.** A collapsed table's rows, its ranges,
 * its canary and the merged buffers are all produced from one `rows` list in
 * one pass, the same way the instanced writer derives transforms and table
 * rows from one `entries` list (`glbBatchedExport.js#collectInstanceGroups`).
 *
 * **The canary is computed from each element's OWN baked arrays, before they
 * are copied into the merged buffers** — so it witnesses the copy and the
 * range bookkeeping rather than restating them. Hashing the merged buffers
 * through the ranges here would agree with the reader by construction and
 * prove nothing about either (`bldrsInstanceTables.js`, module doc).
 */


/** Largest vertex count whose indices still fit a Uint16 index buffer. */
const UINT16_VERTEX_LIMIT = 65536
const COMPONENTS = 3
const TRIANGLE = 3
/** Upper-3x3 entries of a column-major Matrix4 (`elements` indices). */
const LINEAR_ELEMENTS = [0, 1, 2, 4, 5, 6, 8, 9, 10]
const IDENTITY_LINEAR = [1, 0, 0, 0, 1, 0, 0, 0, 1]
// Column-major Matrix4 layout: translation lives in elements 12..14.
const M = {
  XX: 0, YX: 1, ZX: 2,
  XY: 4, YY: 5, ZY: 6,
  XZ: 8, YZ: 9, ZZ: 10,
  TX: 12, TY: 13, TZ: 14,
}


/**
 * Whether a group's geometry can be collapsed without the reader refusing it:
 * every index must address one of the geometry's own vertices, since the
 * reader verifies exactly that per range (`batchedGeometryRanges.js`, "the
 * one invariant") and a stray index would refuse the WHOLE model rather than
 * this element. Also requires whole triangles, which the winding flip below
 * assumes. A group that fails either stays instanced — it is not wrong, just
 * not worth risking the file for.
 *
 * @param {object} geometry BufferGeometry the writer already accepted
 * @return {boolean}
 */
function isCollapsible(geometry) {
  const vertexCount = geometry.getAttribute('position').count
  const index = geometry.index.array
  if (vertexCount === 0 || index.length === 0 || index.length % TRIANGLE !== 0) {
    return false
  }
  for (let i = 0; i < index.length; i++) {
    if (index[i] >= vertexCount) {
      return false
    }
  }
  return true
}


/**
 * Split the writer's groups into the ones that stay instanced and the
 * single-placement ones to merge, binned by colour.
 *
 * Both lists keep the input order, and so does each bin — first-seen order,
 * which is batch-iteration order (`collectInstanceGroups`).
 *
 * @param {Array<object>} groups `{geometry, color, entries}` from
 *   `collectInstanceGroups`, each entry carrying its `matrix`
 * @param {function(object): string} colorKeyOf the writer's colour key, so a
 *   collapsed bin and an instanced group of one colour agree on material
 * @return {{instanced: Array<object>, collapsed: Array<object>}} `collapsed`
 *   is `{color, groups}` per colour
 */
export function planCollapse(groups, colorKeyOf) {
  const instanced = []
  const bins = new Map()
  for (const group of groups) {
    if (group.entries.length !== 1 || !isCollapsible(group.geometry)) {
      instanced.push(group)
      continue
    }
    const key = colorKeyOf(group.color)
    let bin = bins.get(key)
    if (!bin) {
      bin = {color: group.color, groups: []}
      bins.set(key, bin)
    }
    bin.groups.push(group)
  }
  return {instanced, collapsed: [...bins.values()]}
}


/**
 * The point every element in a bin is baked relative to: the centre of the
 * bin's bounds in model space. Computed from each element's local bounds
 * carried through its placement rather than from the placements alone — on
 * a DSA-shaped model every placement is the identity and the world position
 * lives in the vertices, so a centre of translations would be the origin and
 * the precision argument in the module doc would buy nothing.
 *
 * @param {Array<object>} groups one bin's single-placement groups
 * @return {Vector3}
 */
function binCentre(groups) {
  const bounds = new Box3()
  const local = new Box3()
  for (const {geometry, entries} of groups) {
    local.setFromBufferAttribute(geometry.getAttribute('position'))
    bounds.union(local.applyMatrix4(entries[0].matrix))
  }
  return bounds.getCenter(new Vector3())
}


/**
 * @param {object} matrix THREE.Matrix4
 * @return {boolean} true when the linear part is exactly the identity
 */
function hasIdentityLinearPart(matrix) {
  return LINEAR_ELEMENTS.every((e, i) => matrix.elements[e] === IDENTITY_LINEAR[i])
}


/**
 * Bake one element: its vertices through its placement, relative to the bin
 * centre, into fresh row-local arrays.
 *
 * Positions are transformed in double precision and rounded to float32 ONCE,
 * after the centre is subtracted — rounding before the subtraction would
 * throw away exactly the precision the centre is there to keep. Normals go
 * through the normal matrix and are renormalised, except under a pure
 * translation, where they are copied untouched so that the common IFC case
 * stays bit-exact. A mirroring placement (negative determinant) reverses each
 * triangle's winding: glTF defines front faces by winding, and a renderer
 * only compensates a mirrored NODE transform, never baked vertices.
 *
 * @param {object} geometry element's local BufferGeometry
 * @param {object} matrix its placement, THREE.Matrix4
 * @param {Vector3} centre bin centre
 * @return {{positions: Float32Array, normals: Float32Array, indices: Uint32Array}}
 */
function bakeElement(geometry, matrix, centre) {
  const source = geometry.getAttribute('position').array
  const sourceNormals = geometry.getAttribute('normal').array
  const sourceIndex = geometry.index.array
  const e = matrix.elements
  const vertexCount = source.length / COMPONENTS
  const positions = new Float32Array(source.length)
  for (let v = 0; v < vertexCount; v++) {
    const at = v * COMPONENTS
    const x = source[at]
    const y = source[at + 1]
    const z = source[at + 2]
    positions[at] = (e[M.XX] * x) + (e[M.XY] * y) + (e[M.XZ] * z) + e[M.TX] - centre.x
    positions[at + 1] = (e[M.YX] * x) + (e[M.YY] * y) + (e[M.YZ] * z) + e[M.TY] - centre.y
    positions[at + 2] = (e[M.ZX] * x) + (e[M.ZY] * y) + (e[M.ZZ] * z) + e[M.TZ] - centre.z
  }

  let normals
  if (hasIdentityLinearPart(matrix)) {
    normals = Float32Array.from(sourceNormals)
  } else {
    normals = new Float32Array(sourceNormals.length)
    const normalMatrix = new Matrix3().getNormalMatrix(matrix)
    const n = new Vector3()
    for (let v = 0; v < vertexCount; v++) {
      const at = v * COMPONENTS
      n.fromArray(sourceNormals, at).applyMatrix3(normalMatrix)
      // A zero normal stays zero rather than becoming NaN.
      if (n.lengthSq() > 0) {
        n.normalize()
      }
      n.toArray(normals, at)
    }
  }

  const indices = Uint32Array.from(sourceIndex)
  if (matrix.determinant() < 0) {
    for (let t = 0; t < indices.length; t += TRIANGLE) {
      const second = indices[t + 1]
      indices[t + 1] = indices[t + 2]
      indices[t + 2] = second
    }
  }
  return {positions, normals, indices}
}


/**
 * Merge one colour bin into a single primitive plus its range table.
 *
 * @param {object} bin `{color, groups}` from {@link planCollapse}
 * @return {{color: object, centre: Array<number>, positions: Float32Array,
 *   normals: Float32Array, indices: (Uint16Array|Uint32Array),
 *   ranges: Array<{vertexCount: number, indexCount: number}>,
 *   canary: number, entries: Array<object>}} `entries[i]` is row i's
 *   identity, in the same order as `ranges[i]`
 */
export function bakeCollapsedBin(bin) {
  const centre = binCentre(bin.groups)
  let vertexTotal = 0
  let indexTotal = 0
  for (const {geometry} of bin.groups) {
    vertexTotal += geometry.getAttribute('position').count
    indexTotal += geometry.index.count
  }
  const positions = new Float32Array(vertexTotal * COMPONENTS)
  const normals = new Float32Array(vertexTotal * COMPONENTS)
  const indices = vertexTotal <= UINT16_VERTEX_LIMIT ?
    new Uint16Array(indexTotal) : new Uint32Array(indexTotal)
  const ranges = []
  const entries = []
  const canary = makeRangeCanary()

  let vertexStart = 0
  let indexStart = 0
  for (const {geometry, entries: [entry]} of bin.groups) {
    const row = bakeElement(geometry, entry.matrix, centre)
    const vertexCount = row.positions.length / COMPONENTS
    // Hashed from the row's OWN arrays, before the copy below, and with the
    // entry's identity — the same entry the table row is built from
    // (module doc).
    canary.row(
      entry,
      vertexCount, (v, c) => row.positions[(v * COMPONENTS) + c],
      row.indices.length, (i) => row.indices[i])
    positions.set(row.positions, vertexStart * COMPONENTS)
    normals.set(row.normals, vertexStart * COMPONENTS)
    for (let i = 0; i < row.indices.length; i++) {
      indices[indexStart + i] = vertexStart + row.indices[i]
    }
    ranges.push({vertexCount, indexCount: row.indices.length})
    entries.push(entry)
    vertexStart += vertexCount
    indexStart += row.indices.length
  }
  return {
    color: bin.color,
    centre: centre.toArray(),
    positions,
    normals,
    indices,
    ranges,
    canary: canary.digest(),
    entries,
  }
}
