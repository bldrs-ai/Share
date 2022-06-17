const craeateIFCSlice = (set, get) => ({
  viewerStore: {},
  modelStore: null,
  selectedElement: null,
  cameraControls: null,
  setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
  setModelStore: (model) => set(() => ({modelStore: model})),
  setSelectedElement: (element) => set(() => ({selectedElement: element})),
  setCameraControls: (cameraControls) => set(() => ({cameraControls: cameraControls})),
})

export default craeateIFCSlice
