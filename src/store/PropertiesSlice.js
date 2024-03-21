/**
 * Properties store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createPropertiesSlice(set, get) {
  return {
    isPropertiesEnabled: true,
    setIsPropertiesEnabled: (is) => set(() => ({isPropertiesEnabled: is})),

    isPropertiesVisible: false,
    setIsPropertiesVisible: (is) => set(() => ({isPropertiesVisible: is})),
    toggleIsPropertiesVisible: () =>
      set((state) => ({isPropertiesVisible: !state.isPropertiesVisible})),
  }
}
