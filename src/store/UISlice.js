/**
 * Data stored in Zustand for UI state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUISlice(set, get) {
  return {
    isDrawerOpen: false,
    isOpenControlHighlighted: true,
    isPropertiesOn: false,
    isCommentsOn: false,
    snackMessage: null,
    cutPlaneDirection: null,
    levelInstance: null,
    isAddNote: false,
    isCameraPerpective: true,
    openDrawer: () => set(() => ({isDrawerOpen: true})),
    unHighlightOpenControl: () => set(() => ({isOpenControlHighlighted: false})),
    closeDrawer: () => set(() => ({isDrawerOpen: false})),
    toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
    toggleIsCommentsOn: () => set((state) => ({isCommentsOn: !state.isCommentsOn})),
    turnCommentsOn: () => set(() => ({isCommentsOn: true})),
    turnCommentsOff: () => set(() => ({isCommentsOn: false})),
    setSnackMessage: (message) => set(() => ({snackMessage: message})),
    setCutPlaneDirection: (direction) => set(() => ({cutPlaneDirection: direction})),
    setLevelInstance: (planeHeightBottom) => set(() => ({levelInstance: planeHeightBottom})),
    toggleIsAddNote: () => set((state) => ({isAddNote: !state.isAddNote})),
    switchCameraToPerspective: () => set(() => ({isCameraPerpective: true})),
    switchCameraToOrtho: () => set(() => ({isCameraPerpective: false})),
  }
}
