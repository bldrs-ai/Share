/**
 * SideDrawer store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function SideDrawerSlice(set, get) {
  return {
    isSideDrawerEnabled: true,
    isSideDrawerVisible: false,
    sidebarWidthInitial: '350px', // Leave constant. Don't change dynamically
    sidebarWidth: '350px', // Same as sidebarWidthInitial
    sidebarHeightInitial: '70vh', // Leave constant. Don't change dynamically
    sidebarHeight: '70vh',
    setSideDrawerEnabled: (isEnabled) => set(() => ({isSideDrawerEnabled: isEnabled})),
    setSidebarHeight: (height) => set(() => ({sidebarHeight: height})),
    setSidebarWidth: (width) => set(() => ({sidebarWidth: width})),
    setIsSideDrawerVisible: (isVisible) => set(() => ({isSideDrawerVisible: isVisible})),
    toggleIsSideDrawerVisible: () =>
      set((state) => ({isSideDrawerVisible: !state.isSideDrawerVisible})),
  }
}
