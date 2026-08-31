/**
 * outlineBatching — teach `postprocessing`'s OutlineEffect mask pass how to
 * draw a `THREE.BatchedMesh`.
 *
 * Why this exists: `OutlineEffect` builds its mask pass as
 * `new RenderPass(scene, camera, new DepthComparisonMaterial(...))`
 * (postprocessing 6.39.1, `postprocessing.js` ~line 8834) — unconditionally,
 * whatever `xRay` is set to; `xRay` only toggles a define in the *outline*
 * fragment shader, so turning it off does not avoid this material. That
 * material's vertex shader (`src/materials/glsl/depth-comparison.vert`)
 * includes only the morphtarget / skinning / clipping-plane chunks. three.js
 * still compiles it with `USE_BATCHING` whenever the object being drawn is a
 * BatchedMesh (`WebGLPrograms`: `IS_BATCHEDMESH` drives the define, keyed off
 * the object, not the material), and its `project_vertex` chunk then reads
 * `batchingMatrix`, which nothing declared:
 *
 *   THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
 *   Material Name: DepthComparisonMaterial (ShaderMaterial)
 *   ERROR: 0:204: 'batchingMatrix' : undeclared identifier
 *
 * The program then fails to link, the mask never renders, and the isolation
 * outline silently disappears while WebGL logs `useProgram: program not
 * valid` every frame. This surfaced when Share#1806 moved batched-path
 * isolation in place (`BatchedMesh.setVisibleAt`) and pointed the outline at
 * the batches themselves instead of at a re-baked plain `Mesh`.
 *
 * The fix is the two chunks three's own materials carry, injected in three's
 * own order (`batching_pars_vertex` alongside the other `_pars` includes,
 * `batching_vertex` before `begin_vertex` so `batchingMatrix` is in scope by
 * the time `project_vertex` multiplies by it — cf. `meshbasic_vert.glsl.js`).
 * The uniforms it needs (`batchingTexture`, `batchingIdTexture`) are bound by
 * `WebGLRenderer.setProgram` for any material drawn on a BatchedMesh, and the
 * `GL_ANGLE_multi_draw` extension line is emitted for the same reason, so
 * nothing else has to be wired up.
 *
 * Drop this module when postprocessing ships the batching chunks in
 * `depth-comparison.vert` upstream — at that point `injectBatchingChunks`
 * finds the include already present and no-ops, so removal is safe to do
 * lazily.
 */
const BATCHING_PARS_INCLUDE = '#include <batching_pars_vertex>'
const BATCHING_INCLUDE = '#include <batching_vertex>'
const PARS_ANCHOR = '#include <common>'
const MAIN_ANCHOR = '#include <begin_vertex>'


/**
 * Add the batching chunks to a GLSL vertex shader source that lacks them.
 *
 * Exported for testing and for `patchOutlineForBatchedMeshes` below; a source
 * that already includes the pars chunk (a fixed upstream, or a second patch
 * pass) is returned untouched, which is what makes the patch idempotent.
 *
 * @param {string} vertexShader GLSL source
 * @return {?string} the patched source, or null when it could not be
 *   patched — already batching-aware, or missing an anchor the injection
 *   needs (an upstream rewrite we should not guess at).
 */
export function injectBatchingChunks(vertexShader) {
  if (typeof vertexShader !== 'string' ||
      vertexShader.includes(BATCHING_PARS_INCLUDE) ||
      !vertexShader.includes(PARS_ANCHOR) ||
      !vertexShader.includes(MAIN_ANCHOR)) {
    return null
  }
  return vertexShader
    .replace(PARS_ANCHOR, `${PARS_ANCHOR}\n${BATCHING_PARS_INCLUDE}`)
    .replace(MAIN_ANCHOR, `${BATCHING_INCLUDE}\n${MAIN_ANCHOR}`)
}


/**
 * Patch an OutlineEffect's mask-pass material so a BatchedMesh in its
 * selection outlines instead of failing to compile. See the module comment.
 *
 * Reassigning `maskPass.overrideMaterial` is load-bearing, not redundant:
 * postprocessing's `OverrideMaterialManager` clones the material into six
 * side/flat-shading variants at construction time, so mutating the original
 * in place would leave every clone — the ones actually bound at draw time —
 * on the unpatched source. The setter calls `setMaterial`, which re-clones.
 *
 * @param {object} outlineEffect a postprocessing `OutlineEffect`
 * @return {boolean} whether the material was patched
 */
export function patchOutlineForBatchedMeshes(outlineEffect) {
  const material = outlineEffect?.maskPass?.overrideMaterial
  if (!material) {
    return false
  }
  const patched = injectBatchingChunks(material.vertexShader)
  if (patched === null) {
    return false
  }
  material.vertexShader = patched
  material.needsUpdate = true
  outlineEffect.maskPass.overrideMaterial = material
  return true
}
