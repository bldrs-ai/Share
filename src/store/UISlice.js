/**
 * Data stored in Zustand for UI state.
 * @param {function} set
 * @param {function} get
 * @return {Object} Zustand slice.
 */
export default function createUISlice(set, get) {
  return {
    isDrawerOpen: false,
    isPropertiesOn: false,
    isCommentsOn: false,
    snackMessage: null,
    openDrawer: () => set(() => ({isDrawerOpen: true})),
    closeDrawer: () => set(() => ({isDrawerOpen: false})),
    toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
    toggleIsCommentsOn: () => set((state) => ({isCommentsOn: !state.isCommentsOn})),
    setSnackMessage: (message) => set(() => ({snackMessage: message})),
  }
}
