import {MOBILE_HEIGHT, MOBILE_WIDTH} from '../utils/constants'


/**
 * Data stored in Zustand for UI state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUISlice(set, get) {
  return {
    // TODO(pablo): move all of these to feature slice files
    // NOTE: Nav, Notes, Search and Versions have been moved to their Slices
    isOpenControlHighlighted: true,
    isLoading: false,
    isHelpTooltips: false,
    isAppStoreOpen: false,
    snackMessage: null,
    cutPlanes: [],
    levelInstance: null,
    viewer: null,
    appStoreSidebarWidth: MOBILE_WIDTH,
    appStoreSidebarHeight: MOBILE_HEIGHT,
    selectedStoreApp: null,
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
    setAppStoreSidebarHeight: (height) => set(() => ({appStoreSidebarHeight: height})),
    setAppStoreSidebarWidth: (width) => set(() => ({appStoreSidebarWidth: width})),
    setCutPlaneDirections: (directions) => set(() => ({cutPlanes: directions})),
    setIsLoading: (isLoading) => set(() => ({isLoading: isLoading})),
    setLevelInstance: (planeHeightBottom) => set(() => ({levelInstance: planeHeightBottom})),
    setSelectedStoreApp: (appInfo) => set(() => ({selectedStoreApp: appInfo})),
    setSnackMessage: (message) => set(() => ({snackMessage: message})),
    setViewer: (newViewer) => set(() => ({viewer: newViewer})),
    toggleAppStoreDrawer: () => set((state) => ({isAppStoreOpen: !state.isAppStoreOpen})),
    toggleIsHelpTooltips: () => set((state) => ({isHelpTooltips: !state.isHelpTooltips})),
    turnOffIsHelpTooltips: () => set(() => ({isHelpTooltips: false})),
    unHighlightOpenControl: () => set(() => ({isOpenControlHighlighted: false})),
  }
}
