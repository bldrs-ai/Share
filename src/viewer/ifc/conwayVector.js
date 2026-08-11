/**
 * conwayVector — tiny iteration helper shared by the Conway FlatMesh
 * consumers (`flatMeshToBatchedModel`, `flatMeshToInstancedModel`).
 *
 * Conway's compat surface hands back Emscripten `Vector` objects
 * (`size()` / `get(i)`), but the same builders also run over plain JS
 * arrays of FlatMesh-shaped objects in tests. This normalises the two so
 * the callers don't each carry a byte-identical copy of the loop.
 */


/**
 * Iterate a Conway `Vector` (size()/get(i)) or a plain Array uniformly.
 *
 * @param {object|Array} vec
 * @param {Function} fn called with each element
 */
export function forEachVectorItem(vec, fn) {
  const size = typeof vec?.size === 'function' ? vec.size() : (vec?.length ?? 0)
  for (let i = 0; i < size; i++) {
    fn(typeof vec.get === 'function' ? vec.get(i) : vec[i])
  }
}
