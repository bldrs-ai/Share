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
    elementTypesMap: [],
    preselectedElementIds: null,
    cameraControls: null,
    loadedFileInfo: null,
    customViewSettings: null,
    setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
    setModelStore: (model) => set(() => ({model: model})),
    setModelPath: (modelPath) => set(() => ({modelPath: modelPath})),
    setSelectedElement: (element) => set(() => ({selectedElement: element})),
    setSelectedElements: (elements) => set(() => ({selectedElements: elements})),
    setElementTypesMap: (map) => set(() => ({elementTypesMap: map})),
    setPreselectedElementIds: (elementIds) => set(() => ({preselectedElementIds: elementIds})),
    setCameraControls: (cameraControls) => set(() => ({cameraControls: cameraControls})),
    setLoadedFileInfo: (loadedFileInfo) => set(() => ({loadedFileInfo: loadedFileInfo})),
    setCustomViewSettings: (customViewSettings) => set(() => ({customViewSettings: customViewSettings})),
  }
}
