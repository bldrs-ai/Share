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
    setSideDrawerEnabled: (isEnabled) => set(() => ({isSideDrawerEnabled: isEnabled})),
    setIsSideDrawerVisible: (isVisible) => set(() => ({isSideDrawerVisible: isVisible})),
    toggleIsSideDrawerVisible: () =>
      set((state) => ({isSideDrawerVisible: !state.isSideDrawerVisible})),
  }
}
