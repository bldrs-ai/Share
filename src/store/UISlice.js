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
    cutPlaneDirection: null,
    levelInstance: null,
    isAddNote: false,
    isCameraPerpective: true,
    openDrawer: () => set(() => ({isDrawerOpen: true})),
    unHighlightOpenControl: () => set(() => ({isOpenControlHighlighted: false})),
    closeDrawer: () => set(() => ({isDrawerOpen: false})),
    toggleIsCommentsOn: () => set((state) => ({isCommentsOn: !state.isCommentsOn})),
    toggleIsNavPanelOpen: () => set((state) => ({isNavPanelOpen: !state.isNavPanelOpen})),
    toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
    turnCommentsOn: () => set(() => ({isCommentsOn: true})),
    turnCommentsOff: () => set(() => ({isCommentsOn: false})),
    setCutPlaneDirection: (direction) => set(() => ({cutPlaneDirection: direction})),
    setIsNavPanelOpen: (isOpen) => set(() => ({isNavPanelOpen: isOpen})),
    setLevelInstance: (planeHeightBottom) => set(() => ({levelInstance: planeHeightBottom})),
    setSnackMessage: (message) => set(() => ({snackMessage: message})),
    toggleIsAddNote: () => set((state) => ({isAddNote: !state.isAddNote})),
    switchCameraToPerspective: () => set(() => ({isCameraPerpective: true})),
    switchCameraToOrtho: () => set(() => ({isCameraPerpective: false})),
  }
}
