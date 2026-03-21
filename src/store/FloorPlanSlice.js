/**
 * Zustand slice for Floor Plan view state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice
 */
export default function createFloorPlanSlice(set, get) {
  return {
    isFloorPlanMode: false,
    setIsFloorPlanMode: (is) => set(() => ({isFloorPlanMode: is})),
    currentFloorIndex: null,
    setCurrentFloorIndex: (idx) => set(() => ({currentFloorIndex: idx})),
    floors: [],
    setFloors: (floors) => set(() => ({floors})),
    floorPlanCutHeight: 1.2,
    setFloorPlanCutHeight: (h) => set(() => ({floorPlanCutHeight: h})),
  }
}
