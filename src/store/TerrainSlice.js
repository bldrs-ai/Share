/**
 * Zustand slice for terrain overlay state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice
 */
export default function createTerrainSlice(set, get) {
  return {
    isTerrainEnabled: false,
    setIsTerrainEnabled: (is) => set(() => ({isTerrainEnabled: is})),
    isTerrainVisible: false,
    setIsTerrainVisible: (is) => set(() => ({isTerrainVisible: is})),
    terrainStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
    setTerrainStatus: (s) => set(() => ({terrainStatus: s})),
    terrainTileProgress: null, // { downloaded, total }
    setTerrainTileProgress: (p) => set(() => ({terrainTileProgress: p})),
  }
}
