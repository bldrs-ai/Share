// The four-method slice of conway's IfcAPI that `incrementalBatchedBuilder`
// actually uses, served from geometry a worker copied out of ITS wasm heap.
//
// The builder resolves each placement's shape through
// `GetGeometry` → `GetVertexDataSize`/`GetIndexDataSize` →
// `GetVertexArray`/`GetIndexArray`. When extraction runs in a worker those
// calls cannot reach the heap that holds the answer, so the worker copies
// each new geometry out and the buffers arrive here as transferables. This
// re-serves them through the same surface.
//
// Adapting rather than teaching the builder a second input shape is
// deliberate: the builder's geometry cache, coincident-placement dedup,
// batch-capacity growth and bounds accounting are exactly what a worker load
// needs, and a parallel "append pre-resolved" path would be a second
// implementation of all of it that only the worker flag exercises.
//
// The "pointer" the builder round-trips (`GetVertexData()` →
// `GetVertexArray(ptr, size)`) is the geometry's express ID here, not an
// address. Nothing outside this pair inspects it.


/**
 * A geometry store plus the IfcAPI-shaped reader over it.
 *
 * @return {object} `{api, put, has, size}`
 */
export function makeWorkerGeometryApi() {
  const geometries = new Map()

  return {
    /**
     * Record one geometry the worker copied out.
     *
     * First write wins. Shards can each extract a geometry they share —
     * dispatch placement makes that rare rather than impossible — and the
     * copies are identical, so the later arrival is dropped rather than
     * replacing a shape the builder may already have uploaded.
     *
     * @param {object} geometry `{id, vertices, indices, vertCount}`
     */
    put(geometry) {
      if (geometry?.id === undefined || geometries.has(geometry.id)) {
        return
      }
      geometries.set(geometry.id, geometry)
    },

    /**
     * @return {number} distinct geometries held
     */
    get size() {
      return geometries.size
    },

    api: {
      /**
       * @param {number} _modelID ignored — one store per model
       * @param {number} geometryExpressID
       * @return {?object} the builder's geometry handle, or null when the
       *   worker never sent this shape (it rejected it as degenerate, using
       *   the same rules the builder would have)
       */
      GetGeometry(_modelID, geometryExpressID) {
        const entry = geometries.get(geometryExpressID)
        if (entry === undefined) {
          return null
        }
        return {
          GetVertexDataSize: () => entry.vertices.length,
          GetIndexDataSize: () => entry.indices.length,
          GetVertexData: () => geometryExpressID,
          GetIndexData: () => geometryExpressID,
        }
      },

      /**
       * @param {number} token the id `GetVertexData` returned
       * @param {number} _size ignored — the stored array is already exact
       * @return {Float32Array} interleaved position + normal
       */
      GetVertexArray(token, _size) {
        return geometries.get(token).vertices
      },

      /**
       * @param {number} token the id `GetIndexData` returned
       * @param {number} _size ignored — the stored array is already exact
       * @return {Uint32Array} triangle indices
       */
      GetIndexArray(token, _size) {
        return geometries.get(token).indices
      },
    },
  }
}


/**
 * Rebuild FlatMesh-shaped deltas from a worker's transferable columns.
 *
 * Consecutive placements sharing a parent are grouped back into one entry.
 * The builder only ever sees `(parent, placement)` pairs, so the grouping
 * changes nothing it computes — it just keeps the object count near the real
 * FlatMesh count instead of one wrapper per placement.
 *
 * @param {object} placements `{parents, geometryIds, transforms, colors}`
 * @return {Array<object>} FlatMesh-shaped entries
 */
export function decodePlacements(placements) {
  const {parents, geometryIds, transforms, colors} = placements
  const MATRIX_ELEMENTS = 16
  const COLOR_COMPONENTS = 4
  const flatMeshes = []
  let current = null

  for (let where = 0; where < parents.length; ++where) {
    const parent = parents[where]
    if (current === null || current.expressID !== parent) {
      current = {expressID: parent, geometries: []}
      flatMeshes.push(current)
    }
    const base = where * MATRIX_ELEMENTS
    const colorBase = where * COLOR_COMPONENTS
    current.geometries.push({
      geometryExpressID: geometryIds[where],
      // A plain Array, not the Float64Array subarray: the builder hands this
      // to `Matrix4.fromArray` and to `coincidenceKey`, both of which read it
      // positionally, and a copy keeps the placement independent of the
      // transferred buffer's lifetime.
      flatTransformation: Array.from(
        transforms.subarray(base, base + MATRIX_ELEMENTS)),
      color: {
        x: colors[colorBase],
        y: colors[colorBase + 1],
        z: colors[colorBase + 2],
        w: colors[colorBase + 3],
      },
    })
  }

  return flatMeshes
}
