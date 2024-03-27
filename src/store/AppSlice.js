/**
 * Data stored in Zustand for App state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createAppSlice(set, get) {
  return {
    appPrefix: null,
    setAppPrefix: (prefix) => set(() => ({appPrefix: prefix})),

    isAppStoreOpen: false,
    toggleAppStoreDrawer: () => set((state) => ({isAppStoreOpen: !state.isAppStoreOpen})),

    selectedStoreApp: null,
    setSelectedStoreApp: (appInfo) => set(() => ({selectedStoreApp: appInfo})),
  }
}
