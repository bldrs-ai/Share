/**
 * Set Keyboard button Shortcuts
 *
 * @param {object} viewer
 * @param {boolean} selectItemsInScene
 */
export function setKeydownListeners(viewer, selectItemsInScene) {
  window.onkeydown = (event) => {
    // See CadView#initCanvas.  canvas DOM elt must have an attribute
    // tabIndex=0 in order to receieve key events.
    if (!event.target || event.target.tagName !== 'CANVAS') {
      return
    }
    // A viewer disposed by a model switch or a theme re-init stays bound
    // here until the next model's `onModel` binds its own, so a key pressed
    // on the new canvas while that model loads would reach the old viewer's
    // clipper and isolator, which dispose has emptied (IfcIsolator#dispose
    // drops its model, open-205 #2023).
    if (viewer._isDisposed) {
      return
    }
    if (event.code === 'KeyQ') {
      viewer.clipper.createPlane()
    } else if (event.code === 'KeyW') {
      viewer.clipper.deletePlane()
    } else if (event.code === 'KeyA' ||
               event.code === 'Escape') {
      selectItemsInScene([])
    } else if (event.code === 'KeyH') {
      viewer.isolator.hideSelectedElements()
    } else if (event.code === 'KeyU') {
      viewer.isolator.unHideAllElements()
    } else if (event.code === 'KeyI') {
      viewer.isolator.toggleIsolationMode()
    } else if (event.code === 'KeyR') {
      viewer.isolator.toggleRevealHiddenElements()
    }
  }
}
