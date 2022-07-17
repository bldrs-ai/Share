/**
 * Data stored in Zustand for IFC state.
 * @param {function} set
 * @param {function} get
 * @return {Object} Zustand slice.
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
