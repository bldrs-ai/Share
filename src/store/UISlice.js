import {MOBILE_HEIGHT, MOBILE_WIDTH} from '../utils/constants'
import {isVisibleInitially as aboutIsVisibleInitially} from '../Components/About/hashState'
import {isVisibleInitially as helpIsVisibleInitially} from '../Components/Help/hashState'
import {isVisibleInitially as imagineIsVisibleInitially} from '../Components/Imagine/hashState'
import {isVisibleInitially as openModelIsVisibleInitially} from '../Components/Open/hashState'
import {isVisibleInitially as shareIsVisibleInitially} from '../Components/Share/hashState'


const isThemeEnabled = process.env.THEME_IS_ENABLED


/**
 * Data stored in Zustand for UI state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUISlice(set, get) {
  return {
    errorPath: null,
    setErrorPath: (msg) => set(() => ({errorPath: msg})),

    appStoreSidebarWidth: MOBILE_WIDTH,
    setAppStoreSidebarWidth: (width) => set(() => ({appStoreSidebarWidth: width})),

    appStoreSidebarHeight: MOBILE_HEIGHT,
    setAppStoreSidebarHeight: (height) => set(() => ({appStoreSidebarHeight: height})),

    cutPlanes: [],
    addCutPlaneDirection: ({direction, offset}) => set((state) => {
      if (state.cutPlanes.findIndex((cutPlane) => cutPlane.direction === direction) === -1) {
        state.cutPlanes.push({direction, offset})
      }
      return state.cutPlanes
    }),
    removeCutPlaneDirection: (direction) => set((state) => {
      const filterPlanes = state.cutPlanes.filter((cutPlane) => cutPlane.direction !== direction)
      return {cutPlanes: filterPlanes}
    }),
    setCutPlaneDirections: (directions) => set(() => ({cutPlanes: directions})),
    isCutPlaneActive: false,
    setIsCutPlaneActive: (is) => set(() => ({isCutPlaneActive: is})),

    // TODO(pablo): move all of these to feature slice files
    // NOTE: Nav, Notes, Search and Versions have been moved to their Slices
    isAboutVisible: aboutIsVisibleInitially(),
    setIsAboutVisible: (is) => set(() => ({isAboutVisible: is})),

    isHelpVisible: helpIsVisibleInitially(),
    setIsHelpVisible: (is) => set(() => ({isHelpVisible: is})),

    isHelpTooltipsVisible: false,
    setIsHelpTooltipsVisible: (is) => set(() => ({isHelpTooltipsVisible: is})),

    isImagineVisible: imagineIsVisibleInitially(),
    setIsImagineVisible: (is) => set(() => ({isImagineVisible: is})),

    isOpenModelVisible: openModelIsVisibleInitially(),
    setIsOpenModelVisible: (is) => set(() => ({isOpenModelVisible: is})),

    isShareVisible: shareIsVisibleInitially(),
    setIsShareVisible: (is) => set(() => ({isShareVisible: is})),

    isThemeEnabled: isThemeEnabled,
    setIsThemeEnabled: (is) => set(() => ({isThemeEnabled: is})),

    levelInstance: null,
    setLevelInstance: (planeHeightBottom) => set(() => ({levelInstance: planeHeightBottom})),

    snackMessage: null,
    setSnackMessage: (msg) => set(() => ({snackMessage: msg})),

    viewer: null,
    setViewer: (newViewer) => set(() => ({viewer: newViewer})),
  }
}
