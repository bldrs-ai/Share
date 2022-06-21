const craeateIFCSlice = (set, get) => ({
  viewerStore: {},
  modelStore: null,
  selectedElement: null,
  setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
  setModelStore: (model) => set(() => ({modelStore: model})),
  setSelectedElement: (element) => set(() => ({selectedElement: element})),
})

export default craeateIFCSlice
