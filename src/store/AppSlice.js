const isOpfsEnabled = (process.env.OPFS_IS_ENABLED || 'true').toLowerCase() === 'true'


/**
 * Data stored in Zustand for App state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createAppSlice(set, get) {
  return {
    appPrefix: null,
    setAppPrefix: (prefix) => set(() => ({appPrefix: prefix})),
    // Depended on by CadView.  When enabled, null lets detection code set first time.
    isOPFSAvailable: isOpfsEnabled ? null : false,
    setIsOPFSAvailable: (is) => set(() => ({isOPFSAvailable: isOpfsEnabled ? is : false})),
  }
}
