
/**
 * Zustand slice for Sources state.
 *
 * A Source is a specific browsable storage location within a Connection
 * (e.g. a Google Drive folder, a GitHub repo).
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createSourcesSlice(set, get) {
  return {
    sources: [],

    addSource: (source) =>
      set((state) => ({sources: [...state.sources, source]})),

    updateSource: (id, updates) =>
      set((state) => ({
        sources: state.sources.map((s) =>
          s.id === id ? {...s, ...updates} : s,
        ),
      })),

    removeSource: (id) =>
      set((state) => ({
        sources: state.sources.filter((s) => s.id !== id),
      })),

    activeSourceId: null,
    setActiveSourceId: (id) => set(() => ({activeSourceId: id})),

    // File browser state for the active source
    sourceBrowsePath: '',
    setSourceBrowsePath: (path) => set(() => ({sourceBrowsePath: path})),

    sourceFiles: [],
    setSourceFiles: (files) => set(() => ({sourceFiles: files})),

    sourceFolders: [],
    setSourceFolders: (folders) => set(() => ({sourceFolders: folders})),

    isSourceBrowsing: false,
    setIsSourceBrowsing: (is) => set(() => ({isSourceBrowsing: is})),
  }
}
