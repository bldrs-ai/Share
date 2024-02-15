/**
 * Data stored in Zustand for UI state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUISlice(set, get) {
  return {
    alertMessage: null,
    setAlertMessage: (msg) => set(() => ({snackMessage: msg})),

    snackMessage: null,
    setSnackMessage: (msg) => set(() => ({snackMessage: msg})),

    // TODO(pablo): move all of these to feature slice files
    // NOTE: Nav, Notes, Search and Versions have been moved to their Slices
    isOpenControlHighlighted: true,
    isHelpTooltips: false,
    cutPlanes: [],
    levelInstance: null,
    viewer: null,
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
    setLevelInstance: (planeHeightBottom) => set(() => ({levelInstance: planeHeightBottom})),
    setViewer: (newViewer) => set(() => ({viewer: newViewer})),
    toggleIsHelpTooltips: () => set((state) => ({isHelpTooltips: !state.isHelpTooltips})),
    turnOffIsHelpTooltips: () => set(() => ({isHelpTooltips: false})),
    unHighlightOpenControl: () => set(() => ({isOpenControlHighlighted: false})),
  }
}
