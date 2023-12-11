/**
 * Data stored in Zustand for Versions state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function VersionsSlice(set, get) {
  return {
    versions: {},
    setVersions: (versions) => set(() => ({versions: versions})),
    activeVersion: null,
    setActiveVersion: (activeVersion) => set(() => ({activeVersion: activeVersion})),
  }
}
