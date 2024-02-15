/**
 * SideDrawer store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createSideDrawerSlice(set, get) {
  return {
    isSideDrawerEnabled: true,
    setIsSideDrawerEnabled: (isEnabled) => set(() => ({isSideDrawerEnabled: isEnabled})),

    isSideDrawerVisible: false,
    setIsSideDrawerVisible: (isVisible) => set(() => ({isSideDrawerVisible: isVisible})),
    toggleIsSideDrawerVisible: () =>
      set((state) => ({isSideDrawerVisible: !state.isSideDrawerVisible})),

    sidebarWidth: '350px', // Same as sidebarWidthInitial
    setSidebarWidth: (width) => set(() => ({sidebarWidth: width})),

    sidebarWidthInitial: '350px', // Leave constant. Don't change dynamically

    sidebarHeight: '70vh',
    setSidebarHeight: (height) => set(() => ({sidebarHeight: height})),

    sidebarHeightInitial: '70vh', // Leave constant. Don't change dynamically
  }
}
