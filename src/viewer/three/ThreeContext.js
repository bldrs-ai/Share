import {Camera, Object3D, Plane, Scene, Vector2, WebGLRenderer} from 'three'


/**
 * ThreeContext — layered wrapper over the renderer / scene / camera /
 * input mechanics. Replaces ad-hoc reads of the legacy `IfcContext`
 * (from `web-ifc-viewer`) from the rest of the codebase.
 *
 * Per design/new/viewer-replacement.md §3a, every consumer in
 * `src/Components`, `src/Containers`, and the in-repo viewer modules
 * should access scene / camera / renderer / input through the methods
 * on this class. Direct property reach-throughs into the underlying
 * fork (e.g. `context.scene.scene.children`, `context.renderer.update`,
 * `context.ifcCamera.cameraControls`) are migrated to documented
 * accessors here so the eventual fork removal is a localized swap.
 *
 * The instance owns no three.js state of its own yet — it forwards to
 * the legacy context held internally. That changes in Phase 5 of the
 * spec, when the fork's `IfcContext` is dropped and `ThreeContext`
 * directly owns the `Scene`, `Camera`, `WebGLRenderer`, `CSS2DRenderer`,
 * `camera-controls`, and the resize / dispose machinery. The public
 * surface here stays the same across that swap; call-sites need not
 * change again.
 */
export default class ThreeContext {
  /**
   * @param {object} legacyContext An `IfcContext` instance from the
   *     `web-ifc-viewer` fork.
   */
  constructor(legacyContext) {
    this._legacy = legacyContext
  }


  // -- Three primitives ------------------------------------------------------


  /** @return {Scene} */
  getScene() {
    return this._legacy.getScene()
  }


  /** @return {Camera} */
  getCamera() {
    return this._legacy.getCamera()
  }


  /**
   * The underlying WebGLRenderer (not the fork's `IfcRenderer` wrapper).
   * Suitable for read-only access (`.domElement`, `.info`) and the
   * `.dispose()` / `.forceContextLoss()` calls made by viewer.js
   * teardown.
   *
   * @return {WebGLRenderer}
   */
  getRenderer() {
    return this._legacy.getRenderer()
  }


  /** @return {HTMLCanvasElement} */
  getDomElement() {
    return this._legacy.getDomElement()
  }


  /** @return {Array<Plane>} */
  getClippingPlanes() {
    return this._legacy.getClippingPlanes()
  }


  // -- Mouse / input ---------------------------------------------------------


  /**
   * Pointer position in normalized device coordinates ([-1, 1] in both
   * axes), kept up to date by the legacy context's mousemove listener.
   *
   * @return {Vector2}
   */
  getNormalizedMousePosition() {
    return this._legacy.mouse.position
  }


  // -- Camera controls -------------------------------------------------------


  /**
   * The npm `camera-controls` instance driving orbit / pan / zoom for the
   * scene. Use this rather than `viewer.IFC.context.ifcCamera.cameraControls`.
   *
   * @return {object}
   */
  getCameraControls() {
    return this._legacy.ifcCamera.cameraControls
  }


  /**
   * Fit the current camera to the bounds of the loaded model(s) using
   * whichever nav mode is active.
   */
  fitModelToFrame() {
    this._legacy.ifcCamera.currentNavMode.fitModelToFrame()
  }


  // -- Loaded-model registry -------------------------------------------------


  /**
   * The list of IFC-like models currently loaded. Callers may mutate the
   * returned array directly — its mutation surface is what registers a
   * model with the fork's downstream IFC machinery. Once the IfcModelService
   * lands (Phase 3 of the spec) this becomes immutable and a setter on
   * the service takes over.
   *
   * @return {Array<Object3D>}
   */
  getLoadedModels() {
    return this._legacy.items.ifcModels
  }


  /**
   * The list of models the picker raycasts against. Mutated by
   * `Isolator` when switching between full-model, hide-subset, and
   * isolate-subset views.
   *
   * @return {Array<Object3D>}
   */
  getPickableModels() {
    return this._legacy.items.pickableIfcModels
  }


  // -- Raycasting ------------------------------------------------------------


  /**
   * Raycast the loaded IFC-like models using the current pointer.
   * Returns the closest intersection or `null`. Passthrough to the fork's
   * internal raycaster today; will be replaced with the in-repo Picker
   * service when ThreeContext takes over input ownership (§3a, Phase 5).
   *
   * @return {object|null}
   */
  castRayIfc() {
    return this._legacy.castRayIfc()
  }


  /**
   * Raycast against an arbitrary list of objects with the current pointer.
   * Same passthrough caveat as `castRayIfc()`.
   *
   * @param {Array<Object3D>} items
   * @return {Array<object>}
   */
  castRay(items) {
    return this._legacy.castRay(items)
  }


  // -- Render loop -----------------------------------------------------------


  /**
   * Replace the per-frame update function used by the renderer. Used by
   * `Highlighter` to substitute an `EffectComposer.render()` path that
   * runs the outline-effect pipeline.
   *
   * @param {Function} fn invoked once per frame with `(delta)`.
   */
  setRenderUpdate(fn) {
    this._legacy.renderer.update = fn
  }


  // -- Legacy escape hatches (kept narrow on purpose) -----------------------


  /**
   * The fork's `IfcRenderer` wrapper. Only retained for the
   * `Clipper.updateRendererPlanes()` path, which sets a few fields on
   * the wrapper itself. Goes away with the unified Clipper (§3c).
   *
   * @deprecated prefer `getRenderer()` plus a documented setter on this class.
   * @return {object}
   */
  getLegacyRendererWrapper() {
    return this._legacy.renderer
  }


  /**
   * The underlying IfcContext. Provided only so that the in-repo viewer
   * modules (Picker, Isolator, etc.) can keep their existing
   * `constructor(context)` signatures while the fork is still in place;
   * they read documented methods through `this.context.X`, which resolve
   * through ThreeContext.
   *
   * @return {object}
   */
  getLegacyContext() {
    return this._legacy
  }


  /**
   * Dispose passthrough. The fork's `IfcViewerAPI.dispose()` calls
   * `this.context.dispose()`; since we replaced that reference with this
   * wrapper, we need to forward the call.
   */
  dispose() {
    if (this._legacy && typeof this._legacy.dispose === 'function') {
      this._legacy.dispose()
    }
    this._legacy = null
  }
}
