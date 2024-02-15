import {checkOPFSAvailability} from '../OPFS/utils'
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

    isAppStoreOpen: false,
    toggleAppStoreDrawer: () => set((state) => ({isAppStoreOpen: !state.isAppStoreOpen})),

    isOpfsAvailable: checkOPFSAvailability(),

    selectedStoreApp: null,
    setSelectedStoreApp: (appInfo) => set(() => ({selectedStoreApp: appInfo})),
  }
}
