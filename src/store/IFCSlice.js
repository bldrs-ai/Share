/**
 * The IFC slice's per-model state: what belongs to the one model the view
 * shows, and so goes with it when the user leaves it (open-205 #2019,
 * Containers/modelSession.js). The slice's initial state spreads this, so a
 * field declared here starts and resets to the same value by construction;
 * `store/modelState.js#resetModelState` is the one place that resets it.
 * A new per-model field belongs here, not in a list somewhere else.
 *
 * @return {object} fresh defaults (new arrays on every call)
 */
export function ifcModelState() {
  return {
    isFirstMeshShown: false,
    loadReportLines: [],
    currentLoadLine: null,
    loadResult: null,
    isModelReady: false,
    isCacheWriteInFlight: false,
    glbArtifact: null,
    elementTypesMap: [],
    loadedFileInfo: null,
    model: null,
    indexedModel: null,
    rootElement: null,
  }
}


/**
 * The store fields `setIsModelLoading` writes, for a load job's `set`
 * (Containers/modelSession.js) to write the same. A load that ends also ends
 * its first mesh: `isFirstMeshShown` belongs to the load in flight, and the
 * next one starts without it.
 *
 * @param {boolean} isLoading
 * @return {object}
 */
export function modelLoadingState(isLoading) {
  return isLoading ?
    {isModelLoading: true} :
    {isModelLoading: false, isFirstMeshShown: false}
}


/**
 * Data stored in Zustand for IFC state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createIFCSlice(set, get) {
  return {
    // Per-model fields are declared in ifcModelState (above) and documented
    // beside their setters below.
    ...ifcModelState(),

    cameraControls: null,
    setCameraControls: (controls) => set(() => ({cameraControls: controls})),

    customViewSettings: null,
    setCustomViewSettings: (settings) => set(() => ({customViewSettings: settings})),

    // Not per-model state (ifcModelState): the overlay belongs to the load
    // job that put it up, which alone takes it down
    // (Containers/modelSession.js#LoadJob#showLoading), so a switch leaves
    // the left load's overlay up until that load unwinds or the next begins.
    isModelLoading: false,
    setIsModelLoading: (isLoading) => set(() => modelLoadingState(isLoading)),

    // Whether the load in flight has put geometry on screen yet (open-205
    // #2043): set by CadView when a progressive load's first preview mesh or
    // streamed batch lands (ProgressiveLoadSession's `onFirstMesh`) and that
    // load is still the one shown, cleared when the load ends or the user
    // leaves it. The loading overlay lifts on it, so the camera and
    // scene picking are live from the first preview mesh, during the parse
    // (Components/LoadingBackdrop.jsx).
    setIsFirstMeshShown: (isShown) => set(() => ({isFirstMeshShown: isShown})),

    // The normalized load-log report (design/new/load-log-format.md):
    // frozen lines (Share/engine/model preamble + finished stage lines +
    // Total) mirrored 1:1 with what loader/loadProgress.js prints to the
    // console. Drives the status-bar expando and the post-load report
    // dialog. Reset by beginLoadProgress on each load.
    setLoadReportLines: (lines) => set(() => ({loadReportLines: lines})),

    // The running stage's animated line ("Geometry [0%....56%] 41.0s,
    // +388 MB heap"), or null when no load is in flight — the collapsed
    // status-bar expando's one-liner.
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
    setLoadResult: (result) => set(() => ({loadResult: result})),

    // TODO(pablo): really needed?
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
    setGlbArtifact: (artifact) => set(() => ({glbArtifact: artifact})),

    setElementTypesMap: (map) => set(() => ({elementTypesMap: map})),

    setLoadedFileInfo: (loadedFileInfo) => set(() => ({loadedFileInfo: loadedFileInfo})),

    setModel: (m) => set(() => ({model: m})),

    // The model at its index while a Conway (IFC/STEP) load still streams
    // geometry (open-205 #2029; `makeIndexedModelHandle` in
    // viewer/ifc/conwayDirectIfcLoader.js). Carries the property and spatial
    // surface only — no geometry, not an Object3D — so it is kept apart from
    // `model`, which scene consumers (clipper, isolator, ViewCube) take to be
    // the object in the scene. Readers of properties and the tree take it
    // through `selectReadModel` below. Cleared when a load begins, and by the
    // load that set it once its finished model is in `model`, or once it fails.
    setIndexedModel: (m) => set(() => ({indexedModel: m})),

    preselectedElementIds: null,
    setPreselectedElementIds: (ids) => set(() => ({preselectedElementIds: ids})),

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
