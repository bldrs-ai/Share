import {onHash} from '../Components/Camera/CameraControl'
import {reportFirstMesh, reportFramingExclusion} from '../loader/loadProgress'
import useStore from '../store/useStore'
import {robustBoundsFor} from '../viewer/three/robustBounds'


/**
 * Put a loaded model into the viewer's scene and frame it (moved out of
 * CadView#loadModel unchanged, Share#2247). Today the scene is the viewer's
 * and a viewer is built per open; Phase 1b's single-viewer step attaches a
 * session's scene root instead, and this is where that attach goes
 * (design/new/in-app-model-switch.md §4.10).
 *
 * @param {object} viewer the ShareViewer the load streamed into
 * @param {object} loadedModel
 * @param {object} options
 * @param {object} options.location the router location, for a `#c:` camera
 * @param {boolean} options.isCameraTakenDuringLoad the user drove the camera
 *   while the model streamed in (open-205 #2043), so it is not re-framed
 */
export function placeModelInScene(viewer, loadedModel, {location, isCameraTakenDuringLoad}) {
  viewer.context.getScene().add(loadedModel)
  // First geometry in the scene, for formats with no progressive preview
  // (and GLB cache hits): their one-shot arrival is their first mesh. A
  // no-op when ProgressiveLoadSession already recorded an earlier one.
  reportFirstMesh()

  // Size the dolly range + near/far clip planes to the model *before*
  // any camera pose is applied, so the first frame is already drawn
  // with the right frustum. fitModelToFrame does this too, but a
  // permalink with a `#c:` camera hash skips the fit — and then the
  // model renders against the default far = 2000 plane and the first
  // user input clamps the restored distance to maxDistance = 300
  // (#1652).
  viewer.context.fitCameraLimitsToModel(loadedModel)

  const isCamHashSet = onHash(location, viewer.context.getCameraControls())
  // A user who drove the camera while the model streamed in (open-205
  // #2043: orbit and zoom are live from the first preview mesh) is looking
  // at something; framing the whole model now would yank it away. The
  // limits above are still sized, so the model draws and dollies right.
  // design/new/in-app-model-switch.md §4.2a.
  if (!isCamHashSet && !isCameraTakenDuringLoad) {
    // Framing target passed explicitly: the no-arg fallback frames the
    // last scene child, which is the model only by luck of ordering.
    viewer.context.fitModelToFrame(loadedModel)
  }

  // §6e: fit the contact-shadow ground + shadow frustum to the model's
  // bounds (valid now it's added + framed). Optional-chained: the Jest
  // viewer mock doesn't define it.
  viewer.groundModel?.(loadedModel)

  // Framing just ran on outlier-robust bounds (robustBounds.js), and
  // this repeats that cached measurement. If strays were excluded, say
  // so: Health line + console warning + grace-snackbar note. After
  // endLoadProgress by design — it amends the published loadResult.
  // The traverse guard skips the Jest MockModel, which isn't an
  // Object3D.
  if (typeof loadedModel.traverse === 'function') {
    reportFramingExclusion(robustBoundsFor(loadedModel))
  }

  // §6e: apply the active render look's materials to the new model, so a
  // model opened while a non-default look is active still matches.
  viewer.applyLookToModel?.(loadedModel)
}


/**
 * Hide again what the user hid in this model before its viewer was rebuilt
 * (a theme change), by express id (moved out of CadView#onViewerInternal,
 * Share#2247). Hidden elements are keyed per model
 * (`claimHiddenElementsForModel`), so a new model starts with none.
 *
 * @param {object} viewer
 */
export function reapplyHiddenElements(viewer) {
  const hidden = Object.entries(useStore.getState().hiddenElements)
    .filter(([, value]) => value === true).map(([key]) => Number(key))
  if (hidden.length > 0) {
    viewer.isolator.unHideAllElements()
    viewer.isolator.hideElementsById(hidden)
  }
}
