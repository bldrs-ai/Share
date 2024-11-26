const isAppsEnabled = process.env.APPS_IS_ENABLED


/**
 * Data stored in Zustand for Apps state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createAppsSlice(set, get) {
  return {
    isAppsEnabled: isAppsEnabled,

    isAppsOpen: false,
    toggleAppsDrawer: () => set((state) => ({isAppsOpen: !state.isAppsOpen})),

    selectedApp: null,
    setSelectedApp: (appInfo) => set(() => ({selectedApp: appInfo})),
  }
}
