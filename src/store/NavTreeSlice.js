/**
 * NavTree store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function SearchSlice(set, get) {
  return {
    isNavTreeEnabled: true,
    setNavTreeEnabled: (isEnabled) => set(() => ({isNavTreeEnabled: isEnabled})),

    isNavTreeVisible: false,
    setIsNavTreeVisible: (isVisible) => set(() => ({isNavTreeVisible: isVisible})),
    toggleIsNavTreeVisible: () =>
      set((state) => ({isNavTreeVisible: !state.isNavTreeVisible})),
  }
}
