/**
 * Data stored in Zustand for camera state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createCameraSlice(set, get) {
  return {
    isFitToFrame: false,
    setIsFitToFrame: (is) => set(() => ({isFitToFrame: is})),
  }
}
