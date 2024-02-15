/**
 * Data stored in Zustand for Versions state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function VersionsSlice(set, get) {
  return {
    isVersionsEnabled: true,
    setIsVersionsEnabled: (isEnabled) => set(() => ({isVersionsEnabled: isEnabled})),

    activeVersion: 0,
    setActiveVersion: (version) => set(() => ({activeVersion: version})),

    versions: {},
    setVersions: (versions) => set(() => ({versions: versions})),

    isVersionsVisible: false,
    setIsVersionsVisible: (isVisible) => set(() => ({isVersionsVisible: isVisible})),
    toggleIsVersionsVisible: () =>
      set((state) => ({isVersionsVisible: !state.isVersionsVisible})),
  }
}
