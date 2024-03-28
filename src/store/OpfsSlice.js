const isOpfsEnabled = process.env.OPFS_IS_ENABLED


/**
 * Data stored in Zustand for Origin Private File System (OPFS) state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createOpfsSlice(set, get) {
  return {
    // Depended on by CadView.  When enabled, null lets detection code set first time.
    isOpfsAvailable: isOpfsEnabled ? null : false,
    setIsOpfsAvailable: (is) => set(() => ({isOpfsAvailable: isOpfsEnabled ? is : false})),

    opfsFile: null,
    setOpfsFile: (file) => set(() => ({opfsFile: file})),
  }
}
