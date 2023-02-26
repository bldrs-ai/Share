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
    modelPath: null,
    modelStore: null,
    selectedElement: null,
    selectedElements: [],
    cameraControls: null,
    loadedFileInfo: null,
    setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
    setModelPath: (modelPath) => set(() => ({modelPath: modelPath})),
    setModelStore: (model) => set(() => ({modelStore: model})),
    setSelectedElement: (element) => set(() => ({selectedElement: element})),
    setSelectedElements: (elements) => set(() => ({selectedElements: elements})),
    setCameraControls: (cameraControls) => set(() => ({cameraControls: cameraControls})),
    setLoadedFileInfo: (loadedFileInfo) => set(() => ({loadedFileInfo: loadedFileInfo})),
  }
}
