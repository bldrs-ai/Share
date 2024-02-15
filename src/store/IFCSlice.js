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
    setCameraControls: (controls) => set(() => ({cameraControls: controls})),

    customViewSettings: null,
    setCustomViewSettings: (settings) => set(() => ({customViewSettings: settings})),

    elementTypesMap: [],
    setElementTypesMap: (map) => set(() => ({elementTypesMap: map})),

    loadedFileInfo: null,
    setLoadedFileInfo: (loadedFileInfo) => set(() => ({loadedFileInfo: loadedFileInfo})),

    model: null,
    setModelStore: (m) => set(() => ({model: m})),

    modelPath: null,
    setModelPath: (path) => set(() => ({modelPath: path})),

    preselectedElementIds: null,
    setPreselectedElementIds: (ids) => set(() => ({preselectedElementIds: ids})),

    rootElement: null,
    setRootElement: (elt) => set(() => ({rootElement: elt})),

    viewer: {},
    setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
  }
}
