/**
 * shadingMode — the shading axis of the display-override stack (S4,
 * design/new/model-display-controls.md §4).
 *
 * Whole-model scope only, via the material fast-path: `Material.wireframe`
 * is per-material and a BatchedMesh draws all its instances with one
 * material, so flipping the flag on every batch material is exact, O(1), and
 * free. Sub-model wireframe (S5) can't use this — it needs a subset overlay
 * with the shaded instances evicted — so it lives with the scoped work, not
 * here.
 *
 * Shape-agnostic on purpose: it walks materials on any renderable mesh
 * (a live BatchedMesh, its opaque+transparent Group, or a merged cache-hit
 * Mesh), so unlike color this axis does work on a merged reload. `Shaded +
 * edges` is deferred — an `EdgesGeometry` overlay over a packed BatchedMesh
 * needs the per-instance overlay machinery S5 introduces, and a half-working
 * edges mode is worse than none (§4).
 *
 * @see overrideStack — the resolver that carries the `shading` axis.
 * @see DisplayController — applies the resolved shading to the model.
 */


/** Shading modes selectable per scope. */
export const ShadingMode = Object.freeze({
  /** The model's normal surfaces. */
  SHADED: 'shaded',
  /** Edges only, via `Material.wireframe`. */
  WIREFRAME: 'wireframe',
})


/**
 * Run `fn` for every renderable mesh in a model — the model itself if it's a
 * mesh, plus any mesh descendants. Covers a lone BatchedMesh, a two-batch
 * Group, and a merged cache-hit Mesh alike.
 *
 * @param {object} model Object3D root
 * @param {Function} fn called with each mesh (`isMesh` or `isBatchedMesh`)
 */
function eachMesh(model, fn) {
  if (!model) {
    return
  }
  if (model.isMesh || model.isBatchedMesh) {
    fn(model)
  }
  if (typeof model.traverse === 'function') {
    model.traverse((obj) => {
      if (obj !== model && (obj.isMesh || obj.isBatchedMesh)) {
        fn(obj)
      }
    })
  }
}


/**
 * Apply `fn` to each material of a mesh, whether it holds a single material
 * or a material array (the merged path bins colors into an array).
 *
 * @param {object} mesh
 * @param {Function} fn called with each Material
 */
function eachMaterial(mesh, fn) {
  const {material} = mesh
  if (!material) {
    return
  }
  if (Array.isArray(material)) {
    material.forEach(fn)
  } else {
    fn(material)
  }
}


/**
 * Whether shading modes can be offered for this model — i.e. it has at least
 * one renderable mesh whose material we can toggle. Effectively always true
 * for a loaded model; the guard is against an empty/degenerate group.
 *
 * @param {object} model
 * @return {boolean}
 */
export function modelSupportsShading(model) {
  let any = false
  eachMesh(model, (mesh) => {
    eachMaterial(mesh, () => {
      any = true
    })
  })
  return any
}


/**
 * The shading mode the model is currently displaying, read off its
 * materials: wireframe if any material has the flag set, else shaded.
 *
 * @param {object} model
 * @return {string} a {@link ShadingMode}
 */
export function activeShadingMode(model) {
  let wireframe = false
  eachMesh(model, (mesh) => {
    eachMaterial(mesh, (mat) => {
      if (mat.wireframe) {
        wireframe = true
      }
    })
  })
  return wireframe ? ShadingMode.WIREFRAME : ShadingMode.SHADED
}


/**
 * Set the whole-model shading mode by toggling `wireframe` on every material.
 *
 * @param {object} model
 * @param {string} mode a {@link ShadingMode}
 */
export function setShadingMode(model, mode) {
  const wireframe = mode === ShadingMode.WIREFRAME
  eachMesh(model, (mesh) => {
    eachMaterial(mesh, (mat) => {
      mat.wireframe = wireframe
    })
  })
}
