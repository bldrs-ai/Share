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
    isVersionsVisible: false,
    versions: {},
    setActiveVersion: (activeVersion) => set(() => ({activeVersion: activeVersion})),
    setIsVersionsVisible: (isVisible) => set(() => ({isVersionsVisible: isVisible})),
    setVersions: (versions) => set(() => ({versions: versions})),
    toggleIsVersionsVisible: () =>
      set((state) => ({isVersionsVisible: !state.isVersionsVisible})),
  }
}
