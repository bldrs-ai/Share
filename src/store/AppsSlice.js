import {isVisibleInitially as appsIsVisibleInitially} from '../Components/Apps/hashState'
import {loadPinnedAppNames, savePinnedAppNames} from '../Components/Apps/pinnedApps'


const isAppsEnabled = process.env.APPS_IS_ENABLED


/**
 * Data stored in Zustand for Apps state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice
 */
export default function createAppsSlice(set, get) {
  return {
    isAppsEnabled: isAppsEnabled,

    isAppsVisible: appsIsVisibleInitially(),
    setIsAppsVisible: (is) => set(() => ({isAppsVisible: is})),

    selectedApp: null,
    // Selecting an app also marks it running for the session (#1993), so
    // it docks on the workspace Apps bar until closed from there.
    setSelectedApp: (appInfo) => set((state) => ({
      selectedApp: appInfo,
      runningApps: appInfo && !state.runningApps.some((app) => app.appName === appInfo.appName) ?
        [...state.runningApps, appInfo] :
        state.runningApps,
    })),

    // Apps opened this session, in the order they were opened.
    runningApps: [],
    // Close an app from the Apps bar; if it is the one showing, the drawer
    // goes back to the listing.
    closeRunningApp: (appName) => set((state) => ({
      runningApps: state.runningApps.filter((app) => app.appName !== appName),
      selectedApp: state.selectedApp?.appName === appName ? null : state.selectedApp,
    })),

    // Apps the user pinned to the Apps bar, persisted across reloads.
    pinnedAppNames: loadPinnedAppNames(),
    togglePinnedApp: (appName) => set((state) => {
      const pinnedAppNames = state.pinnedAppNames.includes(appName) ?
        state.pinnedAppNames.filter((name) => name !== appName) :
        [...state.pinnedAppNames, appName]
      savePinnedAppNames(pinnedAppNames)
      return {pinnedAppNames}
    }),
  }
}
