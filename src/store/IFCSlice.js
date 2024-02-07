/**
 * Data stored in Zustand for IFC state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createIFCSlice(set, get) {
  return {
    cameraControls: null,
    customViewSettings: null,
    elementTypesMap: [],
    loadedFileInfo: null,
    model: null,
    modelPath: null,
    preselectedElementIds: null,
    rootElement: null,
    selectedElement: null,
    selectedElements: [],
    viewer: {},
    setCameraControls: (cameraControls) => set(() => ({cameraControls: cameraControls})),
    setCustomViewSettings: (customViewSettings) => set(() => ({customViewSettings: customViewSettings})),
    setElementTypesMap: (map) => set(() => ({elementTypesMap: map})),
    setLoadedFileInfo: (loadedFileInfo) => set(() => ({loadedFileInfo: loadedFileInfo})),
    setModelPath: (modelPath) => set(() => ({modelPath: modelPath})),
    setModelStore: (model) => set(() => ({model: model})),
    setPreselectedElementIds: (elementIds) => set(() => ({preselectedElementIds: elementIds})),
    setRootElement: (element) => set(() => ({rootElement: element})),
    setSelectedElement: (element) => set(() => ({selectedElement: element})),
    setSelectedElements: (elements) => set(() => ({selectedElements: elements})),
    setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
  }
}
