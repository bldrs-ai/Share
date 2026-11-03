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
    // A load that ends also ends its first mesh: `isFirstMeshShown` belongs to
    // the load in flight, and the next one starts without it.
    setIsModelLoading: (isLoading) => set(() => (isLoading ?
      {isModelLoading: true} :
      {isModelLoading: false, isFirstMeshShown: false})),

    // Whether the load in flight has put geometry on screen yet (open-205
    // #2043): set by loader/loadProgress.js#reportFirstMesh when a
    // progressive load's first preview mesh or streamed batch lands, cleared
    // when the load ends. The loading overlay lifts on it, so the camera and
    // scene picking are live from the first preview mesh, during the parse
    // (Components/LoadingBackdrop.jsx).
    isFirstMeshShown: false,
    setIsFirstMeshShown: (isShown) => set(() => ({isFirstMeshShown: isShown})),

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

    // Where the current model's cached GLB artifact sits in OPFS:
    // `{cacheKeyArgs, schemaVer, writtenAt, kindLabel}`, or null when this
    // load has none yet. `kindLabel` is the loader's categorical source kind
    // ('github' | 'local' | 'upload' | 'external'), carried here because it
    // is the only place the export UI can learn it — and the cache key's
    // `ns1` is NOT a stand-in for it (it is the repo owner on GitHub and a
    // constant everywhere else).
    //
    // The ONLY hand-off from the loader to the export UI — the
    // cache key is computed inside `Loader.js#load` from the source kind and
    // was never published anywhere, so without this slot nothing outside the
    // loader can find the file (`loadedFileInfo` names the SOURCE, not the
    // artifact).
    //
    // Set by both halves of the cache, because either can be the load that
    // produced the exportable file: the writer after `writeGlbBytesToOPFS`
    // resolves (cache miss), and `tryLoadCachedGlb` on a hit — where no
    // writer runs at all, yet the artifact it just read IS the export.
    // Cleared at the top of every `load()` so the Export section can never
    // offer the previous model's file — and both producers can outlive their
    // load, so they publish through `loader/glbArtifactPublish.js`, which
    // drops a write from a load a newer one has superseded, and every write
    // from a NESTED load (a .bld assembly's children, which have no
    // page-level artifact of their own).
    // See design/new/glb-export-premium.md §1.2.
    glbArtifact: null,
    setGlbArtifact: (artifact) => set(() => ({glbArtifact: artifact})),

    elementTypesMap: [],
    setElementTypesMap: (map) => set(() => ({elementTypesMap: map})),

    loadedFileInfo: null,
    setLoadedFileInfo: (loadedFileInfo) => set(() => ({loadedFileInfo: loadedFileInfo})),

    model: null,
    setModel: (m) => set(() => ({model: m})),

    // The model at its index while a Conway (IFC/STEP) load still streams
    // geometry (open-205 #2029; `makeIndexedModelHandle` in
    // viewer/ifc/conwayDirectIfcLoader.js). Carries the property and spatial
    // surface only — no geometry, not an Object3D — so it is kept apart from
    // `model`, which scene consumers (clipper, isolator, ViewCube) take to be
    // the object in the scene. Readers of properties and the tree take it
    // through `selectReadModel` below. Cleared when a load begins, and by the
    // load that set it once its finished model is in `model`, or once it fails.
    indexedModel: null,
    setIndexedModel: (m) => set(() => ({indexedModel: m})),

    preselectedElementIds: null,
    setPreselectedElementIds: (ids) => set(() => ({preselectedElementIds: ids})),

    rootElement: null,
    setRootElement: (elt) => set(() => ({rootElement: elt})),

    viewer: {},
    setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
  }
}


/**
 * The model to read properties, names and the tree from: the one at its index
 * while a load streams (`indexedModel`), else the loaded `model`. Index first,
 * because while a load runs `model` is whatever was loaded before it — null on
 * a fresh page, but the previous model after an in-app switch.
 *
 * @param {object} state the store state
 * @return {object|null}
 */
export function selectReadModel(state) {
  return state.indexedModel ?? state.model
}
