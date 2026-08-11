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

    // The normalized load-log report (design/new/load-log-format.md):
    // frozen lines (Share/engine/model preamble + finished stage lines +
    // Total) mirrored 1:1 with what loader/loadProgress.js prints to the
    // console. Drives the status-bar expando and the post-load report
    // dialog. Reset by beginLoadProgress on each load.
    loadReportLines: [],
    setLoadReportLines: (lines) => set(() => ({loadReportLines: lines})),

    // The running stage's animated line ("Geometry [0%....56%] 41.0s,
    // +388 MB heap"), or null when no load is in flight — the collapsed
    // status-bar expando's one-liner.
    currentLoadLine: null,
    setCurrentLoadLine: (line) => set(() => ({currentLoadLine: line})),

    // End-of-load grace state (conway #301 UX): once a load settles, the
    // snackbar lingers on a final one-liner before the "i" report control
    // takes over. Shape: {status: 'success'|'error', summaryLine}. On
    // success the snackbar auto-dismisses after a grace period with a
    // shrink-to-"i" animation that draws the eye to where the report now
    // lives; on error it shows the error line and waits for an explicit OK,
    // never animating. null when no load has settled or once the grace
    // snackbar is dismissed. Set by loader/loadProgress.js#endLoadProgress,
    // cleared by beginLoadProgress (next load) and by the snackbar on
    // dismiss. See AlertDialogAndSnackbar.jsx for the grace state machine.
    loadResult: null,
    setLoadResult: (result) => set(() => ({loadResult: result})),

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
