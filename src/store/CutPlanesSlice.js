/**
 * Data stored in Zustand for CutPlanes state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createCutPlanesSlide(set, get) {
  return {
    cutPlanes: [],
    addCutPlaneDirection: ({direction, offset}) => set((state) => {
      if (state.cutPlanes.findIndex((cutPlane) => cutPlane.direction === direction) === -1) {
        state.cutPlanes.push({direction, offset})
      }
      return state.cutPlanes
    }),
    removeCutPlaneDirection: (direction) => set((state) => {
      const filterPlanes = state.cutPlanes.filter((cutPlane) => cutPlane.direction !== direction)
      return {cutPlanes: filterPlanes}
    }),
    setCutPlaneDirections: (directions) => set(() => ({cutPlanes: directions})),
    isCutPlaneActive: false,
    setIsCutPlaneActive: (is) => set(() => ({isCutPlaneActive: is})),
  }
}
