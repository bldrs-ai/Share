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
    setIsPropertiesEnabled: (isEnabled) => set(() => ({isPropertiesEnabled: isEnabled})),
    setIsPropertiesBarVisible: (isVisible) => set(() => ({isPropertiesBarVisible: isVisible})),
    toggleIsPropertiesVisible: () =>
      set((state) => ({isPropertiesVisible: !state.isPropertiesVisible})),
  }
}
