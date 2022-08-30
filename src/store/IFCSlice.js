/**
 * Data stored in Zustand for IFC state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createIFCSlice(set, get) {
  return {
    viewerStore: {},
    modelStore: null,
    selectedElement: null,
    cameraControls: null,
    setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
    setModelStore: (model) => set(() => ({modelStore: model})),
    setSelectedElement: (element) => set(() => ({selectedElement: element})),
    setCameraControls: (cameraControls) => set(() => ({cameraControls: cameraControls})),
  }
}
