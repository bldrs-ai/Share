import {noteUserDisplayChange} from '../Components/Share/viewLink'


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
    if (event.code === 'KeyQ') {
      viewer.clipper.createPlane()
    } else if (event.code === 'KeyW') {
      viewer.clipper.deletePlane()
    } else if (event.code === 'KeyA' ||
               event.code === 'Escape') {
      selectItemsInScene([])
    } else if (event.code === 'KeyH') {
      viewer.isolator.hideSelectedElements()
      noteUserDisplayChange()
    } else if (event.code === 'KeyU') {
      viewer.isolator.unHideAllElements()
      noteUserDisplayChange()
    } else if (event.code === 'KeyI') {
      viewer.isolator.toggleIsolationMode()
      noteUserDisplayChange()
    } else if (event.code === 'KeyR') {
      viewer.isolator.toggleRevealHiddenElements()
    }
  }
}
