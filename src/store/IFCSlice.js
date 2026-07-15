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

    isModelLoading: false,
    setIsModelLoading: (isLoading) => set(() => ({isModelLoading: isLoading})),

    // Last structured load-progress event ({phase, completed, total?, unit,
    // elapsedMs, memoryMb?} — conway core/progress.ts shape, see
    // loader/loadProgress.js). Drives the determinate LoadingBackdrop;
    // null when idle or when the engine predates the progress API (the
    // backdrop then falls back to its indeterminate spinner).
    loadProgress: null,
    setLoadProgress: (progress) => set(() => ({loadProgress: progress})),

    // TODO(pablo): really needed?
    isModelReady: false,
    setIsModelReady: (isReady) => set(() => ({isModelReady: isReady})),

    // True while the post-IFC-parse GLB cache writer is running. Set by
    // `Loader.js`'s wrapper around `exportAndCacheGlb` and consumed by
    // `Properties.jsx` to render a "Caching for next load…" affordance.
    // Default behavior of the writer is fire-and-forget, but the
    // compression + extension-injection pass blocks the main thread
    // (GLTFExporter + property-capture BFS in particular), so the UI
    // tells the user *why* hover-pick / camera-controls might feel laggy
    // immediately post-load. Clears regardless of writer success/fail.
    // See design/new/viewer-replacement.md §3b.iii for the next slice
    // (moving the heavy phases to a worker).
    isCacheWriteInFlight: false,
    setIsCacheWriteInFlight: (inFlight) => set(() => ({isCacheWriteInFlight: inFlight})),

    elementTypesMap: [],
    setElementTypesMap: (map) => set(() => ({elementTypesMap: map})),

    loadedFileInfo: null,
    setLoadedFileInfo: (loadedFileInfo) => set(() => ({loadedFileInfo: loadedFileInfo})),

    model: null,
    setModel: (m) => set(() => ({model: m})),

    preselectedElementIds: null,
    setPreselectedElementIds: (ids) => set(() => ({preselectedElementIds: ids})),

    rootElement: null,
    setRootElement: (elt) => set(() => ({rootElement: elt})),

    viewer: {},
    setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
  }
}
