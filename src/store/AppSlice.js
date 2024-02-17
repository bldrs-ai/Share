import {MOBILE_HEIGHT, MOBILE_WIDTH} from '../utils/constants'


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

    appStoreSidebarWidth: MOBILE_WIDTH,
    setAppStoreSidebarWidth: (width) => set(() => ({appStoreSidebarWidth: width})),

    appStoreSidebarHeight: MOBILE_HEIGHT,
    setAppStoreSidebarHeight: (height) => set(() => ({appStoreSidebarHeight: height})),

    installPrefix: null,
    setInstallPrefix: (prefix) => set(() => ({installPrefix: prefix})),

    isAppStoreOpen: false,
    toggleAppStoreDrawer: () => set((state) => ({isAppStoreOpen: !state.isAppStoreOpen})),

    pathPrefix: null,
    setPathPrefix: (prefix) => set(() => ({pathPrefix: prefix})),

    selectedStoreApp: null,
    setSelectedStoreApp: (appInfo) => set(() => ({selectedStoreApp: appInfo})),
  }
}
