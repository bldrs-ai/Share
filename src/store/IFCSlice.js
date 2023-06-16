/**
 * Data stored in Zustand for IFC state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createIFCSlice(set, get) {
  return {
    viewer: {},
    model: null,
    modelPath: null,
    selectedElement: null,
    selectedElements: [],
    preselectedElementIds: null,
    cameraControls: null,
    setViewer: (viewer) => set(() => ({viewer: viewer})),
    setModel: (model) => set(() => ({model: model})),
    setModelPath: (modelPath) => set(() => ({modelPath: modelPath})),
    setSelectedElement: (element) => set(() => ({selectedElement: element})),
    setSelectedElements: (elements) => set(() => ({selectedElements: elements})),
    setPreselectedElementIds: (elementIds) => set(() => ({preselectedElementIds: elementIds})),
    setCameraControls: (cameraControls) => set(() => ({cameraControls: cameraControls})),
  }
}
