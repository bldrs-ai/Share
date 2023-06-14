import {MOBILE_HEIGHT, MOBILE_WIDTH} from '../utils/constants'
import debug from '../utils/debug'


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
    isNavPanelOpen: false,
    isOpenControlHighlighted: true,
    isPropertiesOn: false,
    snackMessage: null,
    cutPlanes: [],
    isBranches: false,
    levelInstance: null,
    viewer: null,
    sidebarWidth: MOBILE_WIDTH,
    sidebarHeight: MOBILE_HEIGHT,
    showControls: true,
    showNavigationGroup: false,
    isHelpTooltips: false,
    isAppStoreOpen: false,
    appStoreSidebarWidth: MOBILE_WIDTH,
    appStoreSidebarHeight: MOBILE_HEIGHT,
    selectedStoreApp: null,
    showViewsPanel: false,
    isElementNavigation: true,
    openDrawer: () => set(() => ({isDrawerOpen: true})),
    unHighlightOpenControl: () => set(() => ({isOpenControlHighlighted: false})),
    closeDrawer: () => set(() => ({isDrawerOpen: false})),
    toggleIsNotesOn: () => set((state) => ({isNotesOn: !state.isNotesOn})),
    openNotes: () => set(() => ({isNotesOn: true})),
    closeNotes: () => set(() => ({isNotesOn: false})),
    showNavPanel: () => set(() => ({isNavPanelOpen: true})),
    hideNavPanel: () => set(() => ({isNavPanelOpen: false})),
    toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
    toggleIsHelpTooltips: () => set((state) => ({isHelpTooltips: !state.isHelpTooltips})),
    turnOffIsHelpTooltips: () => set(() => ({isHelpTooltips: false})),
    toggleShowControls: () => set((state) => ({showControls: !state.showControls})),
    closeProperties: () => set(() => ({isPropertiesOn: false})),
    setCutPlaneDirections: (directions) => set(() => ({cutPlanes: directions})),
    setIsBranches: (isBranches) => set(() => ({isBranches: isBranches})),
    setElementNavigation: () => set((state) => ({isElementNavigation: true})),
    setTypeNavigation: () => set((state) => ({isElementNavigation: false})),
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
    // setIsNavPanelOpen: (isOpen) => set(() => ({isNavPanelOpen: isOpen})),
    setLevelInstance: (planeHeightBottom) => set(() => ({levelInstance: planeHeightBottom})),
    setSnackMessage: (message) => set(() => ({snackMessage: message})),
    setViewer: (newViewer) => set(() => ({viewer: newViewer})),
    setSidebarWidth: (newSidebarWidth) => set(() => ({sidebarWidth: newSidebarWidth})),
    setSidebarHeight: (newSidebarHeight) => set(() => ({sidebarHeight: newSidebarHeight})),
    setDrawer: (newDrawer) => set(() => ({drawer: newDrawer})),
    toggleAppStoreDrawer: () => set((state) => ({isAppStoreOpen: !state.isAppStoreOpen})),
    toggleShowViewsPanel: () => set((state) => ({showViewsPanel: !state.showViewsPanel})),
    toggleShowNavigationGroup: () => set((state) => ({showNavigationGroup: !state.showNavigationGroup})),
    setAppStoreSidebarWidth: (newSidebarWidth) => set(() => ({appStoreSidebarWidth: newSidebarWidth})),
    setAppStoreSidebarHeight: (newSidebarHeight) => set(() => ({appStoreSidebarHeight: newSidebarHeight})),
    setSelectedStoreApp: (appInfo) => set(() => ({selectedStoreApp: appInfo})),
  }
}
