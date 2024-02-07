/**
 * Properties store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function PropertiesSlice(set, get) {
  return {
    isPropertiesEnabled: true,
    isPropertiesVisible: false,
    setIsPropertiesEnabled: (is) => set(() => ({isPropertiesEnabled: is})),
    setIsPropertiesVisible: (is) => set(() => ({isPropertiesVisible: is})),
    toggleIsPropertiesVisible: () =>
      set((state) => ({isPropertiesVisible: !state.isPropertiesVisible})),
  }
}
