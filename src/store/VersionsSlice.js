import {isVisibleInitially} from '../Components/Versions/hashState'


/**
 * Data stored in Zustand for Versions state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createVersionsSlice(set, get) {
  return {
    isVersionsEnabled: false,
    setIsVersionsEnabled: (is) => set(() => ({isVersionsEnabled: is})),

    activeVersion: 0,
    setActiveVersion: (version) => set(() => ({activeVersion: version})),

    isVersionsVisible: isVisibleInitially(),
    setIsVersionsVisible: (is) => set(() => ({isVersionsVisible: is})),
    toggleIsVersionsVisible: () =>
      set((state) => ({isVersionsVisible: !state.isVersionsVisible})),

    versions: {},
    setVersions: (versions) => set(() => ({versions: versions})),
  }
}
