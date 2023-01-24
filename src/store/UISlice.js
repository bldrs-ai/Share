import debug from '../utils/debug'

/**
 * Data stored in Zustand for UI state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUISlice(set, get) {
  return {
    isCommentsOn: false,
    isDrawerOpen: false,
    isNavPanelOpen: true,
    isOpenControlHighlighted: true,
    isPropertiesOn: false,
    snackMessage: null,
    cutPlanes: [],
    levelInstance: null,
    openDrawer: () => set(() => ({isDrawerOpen: true})),
    unHighlightOpenControl: () => set(() => ({isOpenControlHighlighted: false})),
    closeDrawer: () => set(() => ({isDrawerOpen: false})),
    toggleIsCommentsOn: () => set((state) => ({isCommentsOn: !state.isCommentsOn})),
    toggleIsNavPanelOpen: () => set((state) => ({isNavPanelOpen: !state.isNavPanelOpen})),
    toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
    turnCommentsOn: () => set(() => ({isCommentsOn: true})),
    turnCommentsOff: () => set(() => ({isCommentsOn: false})),
    setCutPlaneDirections: (directions) => set(() => ({cutPlanes: directions})),
    addCutPlaneDirection: ({direction, offset}) => set((state) => {
      debug().log('UISlice#addCutPlaneDirection: cutPlanes(start): ', state.cutPlanes)
      if (state.cutPlanes.findIndex((cutPlane) => cutPlane.direction === direction) === -1) {
        state.cutPlanes.push({direction, offset})
      }
      debug().log('UISlice#addCutPlaneDirection: cutPlanes(end): ', state.cutPlanes)
      return state.cutPlanes
    }),
    removeCutPlaneDirection: (direction) => set((state) => {
      const filterPlanes = state.cutPlanes.filter((cutPlane) => cutPlane.direction !== direction)
      debug().log('UISlice#removeCutPlaneDirection: filterPlanes: ', filterPlanes)
      return {cutPlanes: filterPlanes}
    }),
    setIsNavPanelOpen: (isOpen) => set(() => ({isNavPanelOpen: isOpen})),
    setLevelInstance: (planeHeightBottom) => set(() => ({levelInstance: planeHeightBottom})),
    setSnackMessage: (message) => set(() => ({snackMessage: message})),
  }
}
