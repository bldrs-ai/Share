import {isVisibleInitially as appsIsVisibleInitially} from '../Components/Apps/hashState'


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

    isAppsVisible: appsIsVisibleInitially(),
    setIsAppsVisible: (is) => set(() => ({isAppsVisible: is})),
    toggleAppsIsVisible: () => set((state) => ({isAppsVisible: !state.isAppsVisible})),

    selectedApp: null,
    setSelectedApp: (appInfo) => set(() => ({selectedApp: appInfo})),

  }
}
