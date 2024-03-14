import {MOBILE_HEIGHT, MOBILE_WIDTH} from '../utils/constants'
import debug from '../utils/debug'


const isThemeEnabled = (process.env.THEME_IS_ENABLED || 'true').toLowerCase() === 'true'


/**
 * Data stored in Zustand for UI state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUISlice(set, get) {
  return {
    isNotesOn: false,
    isDrawerOpen: false,
    isNavPanelOpen: true,
    isNavigationVisible: false,
    isSearchVisible: false,
    isVersionHistoryVisible: false,
    isOpenControlHighlighted: true,
    isPropertiesOn: false,
    isLoading: false,
    isHelpTooltips: false,
    isAppStoreOpen: false,
    isThemeEnabled: isThemeEnabled,
    snackMessage: null,
    cutPlanes: [],
    levelInstance: null,
    viewer: null,
    sidebarWidth: MOBILE_WIDTH,
    sidebarHeight: MOBILE_HEIGHT,
    appStoreSidebarWidth: MOBILE_WIDTH,
    appStoreSidebarHeight: MOBILE_HEIGHT,
    selectedStoreApp: null,
    openDrawer: () => set(() => ({isDrawerOpen: true})),
    unHighlightOpenControl: () => set(() => ({isOpenControlHighlighted: false})),
    closeDrawer: () => set(() => ({isDrawerOpen: false})),
    toggleIsNotesOn: () => set((state) => ({isNotesOn: !state.isNotesOn})),
    openNotes: () => set(() => ({isNotesOn: true})),
    closeNotes: () => set(() => ({isNotesOn: false})),
    toggleIsNavPanelOpen: () => set((state) => ({isNavPanelOpen: !state.isNavPanelOpen})),
    toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
    toggleIsHelpTooltips: () => set((state) => ({isHelpTooltips: !state.isHelpTooltips})),
    turnOffIsHelpTooltips: () => set(() => ({isHelpTooltips: false})),
    closeProperties: () => set(() => ({isPropertiesOn: false})),
    addCutPlaneDirection: ({direction, offset}) => set((state) => {
      debug().log('UISlice#addCutPlaneDirection: cutPlanes(start): ', state.cutPlanes)
      if (state.cutPlanes.findIndex((cutPlane) => cutPlane.direction === direction) === -1) {
        state.cutPlanes.push({direction, offset})
      }
      debug().log('UISlice#addCutPlaneDirection: cutPlanes(end): ', state.cutPlanes)
      return state.cutPlanes
    }),
    removeCutPlaneDirection: (direction) => set((state) => {
      const filterPlanes = state.cutPlanes.filter((cutPlane) => cutPlane.direction !== direction)
      debug().log('UISlice#removeCutPlaneDirection: filterPlanes: ', filterPlanes)
      return {cutPlanes: filterPlanes}
    }),
    setCutPlaneDirections: (directions) => set(() => ({cutPlanes: directions})),
    setIsNavPanelOpen: (isOpen) => set(() => ({isNavPanelOpen: isOpen})),
    setIsLoading: (isLoading) => set(() => ({isLoading: isLoading})),
    setIsThemeEnabled: (is) => set(() => ({isThemeEnabled: is})),
    setLevelInstance: (planeHeightBottom) => set(() => ({levelInstance: planeHeightBottom})),
    setSnackMessage: (message) => set(() => ({snackMessage: message})),
    setViewer: (newViewer) => set(() => ({viewer: newViewer})),
    setSidebarWidth: (newSidebarWidth) => set(() => ({sidebarWidth: newSidebarWidth})),
    setSidebarHeight: (newSidebarHeight) => set(() => ({sidebarHeight: newSidebarHeight})),
    setDrawer: (newDrawer) => set(() => ({drawer: newDrawer})),
    toggleAppStoreDrawer: () => set((state) => ({isAppStoreOpen: !state.isAppStoreOpen})),
    toggleIsVersionHistoryVisible: () => set((state) => ({isVersionHistoryVisible: !state.isVersionHistoryVisible})),
    toggleIsNavigationVisible: () => set((state) => ({isNavigationVisible: !state.isNavigationVisible})),
    toggleIsSearchVisible: () => set((state) => ({isSearchVisible: !state.isSearchVisible})),
    setAppStoreSidebarWidth: (newSidebarWidth) => set(() => ({appStoreSidebarWidth: newSidebarWidth})),
    setAppStoreSidebarHeight: (newSidebarHeight) => set(() => ({appStoreSidebarHeight: newSidebarHeight})),
    setSelectedStoreApp: (appInfo) => set(() => ({selectedStoreApp: appInfo})),
  }
}
