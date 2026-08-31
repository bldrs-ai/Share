import debug from '../utils/debug'


const VIEWCUBE_VISIBLE_KEY = 'bldrs-viewcube-visible'


/** @return {boolean} The persisted visibility, or false (hidden) by default. */
function readStoredVisibility() {
  try {
    return window.localStorage.getItem(VIEWCUBE_VISIBLE_KEY) === 'true'
  } catch {
    return false
  }
}


/**
 * Persist whether the ViewCube widget is shown so it is remembered across
 * reloads, alongside its corner position (see ViewCube.jsx).
 *
 * @param {boolean} isVisible
 */
function storeVisibility(isVisible) {
  try {
    window.localStorage.setItem(VIEWCUBE_VISIBLE_KEY, isVisible ? 'true' : 'false')
  } catch (e) {
    debug().warn('ViewCube: could not persist visibility', e)
  }
}


/**
 * Data stored in Zustand for ViewCube state: whether the navigation widget is
 * currently shown.  Toggled from the bottom toolbar and the widget's own close
 * control; persisted to localStorage.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createViewCubeSlice(set, get) {
  return {
    isViewCubeVisible: readStoredVisibility(),
    setIsViewCubeVisible: (is) => set(() => {
      storeVisibility(is)
      return {isViewCubeVisible: is}
    }),
    toggleIsViewCubeVisible: () => {
      const next = !get().isViewCubeVisible
      storeVisibility(next)
      set(() => ({isViewCubeVisible: next}))
    },
  }
}
