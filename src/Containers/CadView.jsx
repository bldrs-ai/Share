import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {useNavigate, useSearchParams, useLocation} from 'react-router-dom'
import {MeshLambertMaterial} from 'three'
import {Box} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {captureException} from '@sentry/react'
import {fileSuffixBoundaryRegex} from '../Filetype'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {onHash} from '../Components/Camera/CameraControl'
import {
  FUNNEL_EVENTS,
  LOCAL_HOUR_PARAM,
  MODEL_ACTIONS,
  MODEL_GATES,
  OPEN_CID_PARAM,
  getLocalHour,
  getOpenCid,
  gtagEvent,
  gtagFunnelEvent,
  isRealModelOpen,
  modelContentId,
  modelRouteSource,
  startModelEngagement,
} from '../privacy/analytics'
import {trackEngagementOnOpen} from '../privacy/engagementTracking'
import {trackModelActionWhenAuthSettled} from '../privacy/modelActionTracking'
import {getRenderMode} from '../privacy/preferences'
import {resetPlanes as resetCutPlaneState} from '../Components/CutPlane/CutPlaneMenu'
import {useIsMobile} from '../Components/Hooks'
import {load} from '../loader/Loader'
import {
  LOAD_OUTCOMES,
  attachLoadFailureContext,
  beginLoadProgress,
  captureLoadDiagnostics,
  currentLoadSerial,
  endLoadProgress,
  getCompletedLoadOutcome,
  getCompletedLoadStats,
  getLoadFailureInfo,
  noGeometryAlert,
  reportFirstMesh,
  reportFramingExclusion,
  reportLoadProgress,
} from '../loader/loadProgress'
import {buildOutcomeParams, loadFailureParams} from '../loader/loadAnalytics'
import {robustBoundsFor} from '../viewer/three/robustBounds'
import {NeedsReconnectError} from '../connections/errors'
import {EngineOpenFailureError, engineFailureCaptureContext} from '../loader/engineOpenFailure'
import {UnsupportedSchemaError, reportUnsupportedSchema} from '../loader/unsupportedSchema'
import {hasInMemoryUpload} from '../loader/inMemoryUploads'
import {ARCHIVE_UNREADABLE} from '../loader/modelArchive'
import {ZipArchiveError} from '../loader/zipArchive'
import {
  InMemoryUploadGoneError,
  UploadNotInBrowserError,
  inMemoryUploadGoneAlert,
  uploadNotInBrowserAlert,
} from '../OPFS/messages'
import {reportUploadNotInBrowser} from '../OPFS/reportUploadNotInBrowser'
import {getBrowser} from '../connections/registry'
import {installEngineDevHook} from '../engine/engineDevHook'
import useLegacyViewRulesNotice from '../engine/useLegacyViewRulesNotice'
import modelIdentity from '../routes/modelIdentity'
import useExistInFeature from '../hooks/useExistInFeature'
import useDirectLinkQuota from '../quota/useDirectLinkQuota'
import useStore from '../store/useStore'
import {selectReadModel} from '../store/IFCSlice'
import {
  expandedIdsForSelection,
  getDescendantExpressIds,
  getParentPathIdsForElement,
  setupLookupAndParentLinks,
} from '../utils/TreeUtils'
import {areDefinedAndNotNull, assertDefined} from '../utils/assert'
import debug from '../utils/debug'
import {disablePageReloadApprovalCheck} from '../utils/event'
import {groupElementsByTypes} from '../utils/ifc'
import {navWith} from '../utils/navigate'
import {labelForGeometryId} from '../utils/geometryLabels'
import {
  findRootLevelOwnerNode,
  findRootLevelProductNode,
  findSoleRootNode,
  occurrenceElementPathIds,
  occurrencePathKey,
  occurrencePathKeySetForTree,
  occurrencePathsEqual,
  resolveElementPathOccurrence,
  resolvePickedOccurrenceNode,
  resolveRootOnlyElementPath,
  rootLevelInstancesOfProduct,
  rootLevelSelectionForAnchors,
  selectedOccurrences,
  toggleRootLevelInstanceSelection,
  trimToTreeOccurrencePath,
} from '../utils/occurrencePaths'
import {isOutOfMemoryError} from '../utils/oom'
import {setKeydownListeners} from '../utils/shortcutKeys'
import Picker from '../viewer/three/Picker'
import {loadPreviewGroups, pickPreviewExpressId, previewOccurrencePickOf} from '../viewer/previewSelection'
import {streamingBatchRoots, streamingPickOf} from '../viewer/streamingBatchPick'
import {USER_CAMERA_EVENT} from '../viewer/three/renderDemand'
import {DEFAULT_LOOK} from '../viewer/looks'
import {installAssistDevHook} from '../viewer/tools/assistHost'
import {registerSelectionFunnel} from '../viewer/tools/selectionFunnel'
import ViewCube from '../Components/ViewCube/ViewCube'
import {applyVisibilityHash} from '../Components/Residency/visibilityHash'
import VisibilityHashWriter from '../Components/Residency/VisibilityHashWriter'
import SelectionHashWriter from './SelectionHashWriter'
import {readSelectionHash, resolveSelectionRefs, selectionFitsLink} from './selectionHash'
import RootLandscape from './RootLandscape'
import ViewerContainer from './ViewerContainer'
import {
  AUTH_SETTLE_GRACE_MS,
  AUTH_SETTLE_RETRY_MS,
  isAuthShapedLoadError,
  waitForAuthSettled,
} from './authLoadGate'
import {elementSelection} from './selection'
import {partsToPath} from './urls'
import {initViewer} from './viewer'


let count = 0

/**
 * Only container for the app.  Hosts the IfcViewer as well as nav components.
 *
 * @return {ReactElement}
 */
export default function CadView({
  installPrefix,
  appPrefix,
  pathPrefix,
}) {
  assertDefined(...arguments)
  debug().log('CadView#init: count: ', count++)

  // Begin useStore //

  const accessToken = useStore((state) => state.accessToken)
  const isAuthResolved = useStore((state) => state.isAuthResolved)
  const connections = useStore((state) => state.connections)
  const isViewCubeVisible = useStore((state) => state.isViewCubeVisible)
  const isTempIsolationModeOn = useStore((state) => state.isTempIsolationModeOn)
  const customViewSettings = useStore((state) => state.customViewSettings)
  const elementTypesMap = useStore((state) => state.elementTypesMap)
  const preselectedElementIds = useStore((state) => state.preselectedElementIds)
  const searchIndex = useStore((state) => state.searchIndex)
  const selectedElements = useStore((state) => state.selectedElements)
  const selectedInstanceIds = useStore((state) => state.selectedInstanceIds)
  const selectedOccurrencePath = useStore((state) => state.selectedOccurrencePath)
  const setSelectedInstanceIds = useStore((state) => state.setSelectedInstanceIds)
  const setSelectedOccurrencePath = useStore((state) => state.setSelectedOccurrencePath)
  const setSelectedSolidExpressId = useStore((state) => state.setSelectedSolidExpressId)
  const setCutPlaneDirections = useStore((state) => state.setCutPlaneDirections)
  const setElementTypesMap = useStore((state) => state.setElementTypesMap)
  const setIsNavTreeVisible = useStore((state) => state.setIsNavTreeVisible)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)
  const setIsPropertiesVisible = useStore((state) => state.setIsPropertiesVisible)
  const setIsSearchBarVisible = useStore((state) => state.setIsSearchBarVisible)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const setLoadedFileInfo = useStore((state) => state.setLoadedFileInfo)
  const rootElement = useStore((state) => state.rootElement)
  const setRootElement = useStore((state) => state.setRootElement)
  const setSelectedElement = useStore((state) => state.setSelectedElement)
  const setSelectedElements = useStore((state) => state.setSelectedElements)
  const setSelectedAnchorIds = useStore((state) => state.setSelectedAnchorIds)
  const selectedAnchorIds = useStore((state) => state.selectedAnchorIds)
  const setViewer = useStore((state) => state.setViewer)
  const viewer = useStore((state) => state.viewer)

  // AppSlice
  const isOpfsAvailable = useStore((state) => state.isOpfsAvailable)
  const setAppPrefix = useStore((state) => state.setAppPrefix)

  // Tracks the theme-change listener registered by onModelPath() so we
  // can remove it before registering a new one on the next model load.
  // Otherwise each prior listener stays in the registry, capturing its
  // (now-disposed) viewer via closure and pinning it from GC. A ref
  // (not module-level state) so two CadView mounts in the same process —
  // tests, multi-pane layouts — don't stomp each other.
  const previousThemeChangeCbRef = useRef(null)
  const stopModelEngagementRef = useRef(null)
  // The path and tree the location watcher last selected from (see there).
  const lastPathSelectionRef = useRef(null)

  // Two useEffects below can each trigger `onViewer()` — the
  // [viewer]-dep effect fires when `onModelPath` sets a new viewer, and the
  // [isAuthLoading, …]-dep effect fires (with an `!isViewerLoaded` guard) so
  // a model whose initial `onViewer` returned early on OPFS-status-unknown
  // retries once availability lands, and again on auth-state changes. If
  // auth settles WHILE the first onViewer is mid-`loadModel`,
  // `isViewerLoaded` is still false (it's only set at the end), so both
  // fire end-to-end → double load. This in-flight ref dedupes overlapping
  // calls; whichever effect tick wins, the other skips.
  const onViewerInFlightRef = useRef(false)
  // The model the in-flight onViewer is loading, and whether a call for a
  // DIFFERENT model arrived meanwhile. That is not a duplicate: dropping it
  // left the URL on the new model while nothing ever loaded it. It became
  // reachable once a no-OPFS local open switched models by an in-app
  // navigation instead of a page load (navigateToInMemoryModel, #1906; codex
  // review on #1957). Such a call is replayed, through `latestOnViewerRef` so
  // it sees that render's viewer and modelPath, once the in-flight one ends.
  // Keyed by model identity, not by viewer: the viewer is also re-created
  // for the SAME model during mount, and those calls must stay deduped (the
  // Safari double-load above).
  const inFlightModelKeyRef = useRef(null)
  const isViewerReloadPendingRef = useRef(false)
  const latestOnViewerRef = useRef(null)
  // The alert as it stood when the in-flight load began. If that load is
  // superseded and fails, the alert it raises belongs to a model the user
  // has already left; left up, it would sit over the replayed model, and
  // dismissing it navigates home (codex review on #1957).
  const alertAtLoadStartRef = useRef(null)
  // The model a schema refusal was last counted in Sentry for
  // (unsupportedSchema.js#reportUnsupportedSchema). The auth-state effect
  // below can re-run onViewer for the SAME route after a refusal —
  // isViewerLoaded stays false on failure — and each re-run would count
  // the refusal again, inflating the demand numbers the report exists for
  // (codex review of Share#1899). Keyed by model identity and cleared when
  // the identity changes (dedupeModelKeyRef, in the modelPath effect), not on
  // every run of it: that effect also re-runs for the same model (Widget API
  // view settings), and clearing there let one model count twice (codex
  // review of Share#1961). The upload-not-in-browser count (#1955) is gated
  // by the same ref, under its own key prefix, and so is the no-geometry
  // alert (#1962), which is shown once per model rather than counted.
  const reportedRefusalRef = useRef(null)
  // This render's `selectItemsInScene`, for the funnel registered with
  // `viewer/tools/selectionFunnel.js` (see the effect near the end).
  const selectItemsInSceneRef = useRef(null)
  // open-205 #2043: a double-click during the load, made before the model's
  // index — on a parse-time preview mesh (selectFromPreviewPick: the element
  // id) or on a durable batch still streaming in (selectFromStreamingPick:
  // its row's `{parentExpressId, instanceId, occurrencePath, geometryId}`).
  // Held until the tree is up to resolve it against
  // (resolvePendingPreviewPick); null when no such pick is waiting.
  const pendingPreviewPickRef = useRef(null)
  // Whether the load in flight took a preview pick at all, before or after
  // its index: its selection has to be painted onto the finished model, and
  // taken down if the user leaves or the load fails, like a selection made at
  // the index (#2029). Reset as each load begins.
  const previewPickedRef = useRef(false)
  // Whether the user drove the camera during the load in flight. If so the
  // end-of-load auto-fit is skipped: the user is looking at something
  // (design/new/in-app-model-switch.md §4.2a).
  const isCameraTakenDuringLoadRef = useRef(false)
  // How loadModel last downloaded a Drive file: `{fileId, connection}`, with
  // connection null for the API-key path. The direct-link quota meter reads
  // it to tell a link-shared (public, unmetered) file from a private one
  // (quota/useDirectLinkQuota.js, design/new/quotas.md §"Drive visibility").
  const driveDownloadRef = useRef(null)
  // The identity of the model this CadView is showing now: the one the two
  // dedupe refs belong to, set synchronously when modelPath changes. A load
  // compares it with its own model's identity before writing per-model state,
  // so a load the user has navigated away from, which nothing cancels
  // (#2019), cannot write over the model that replaced it (open-205).
  const dedupeModelKeyRef = useRef(null)
  // The model a `load_failed` was last sent for, for the same reason and
  // with the same keying as reportedRefusalRef: the auth-state effect and
  // the customViewSettings effect re-run onViewer for the SAME route after
  // any failure (isViewerLoaded stays false), and without this each re-run
  // would send another load_failed for one user open (codex review of
  // Share#1961).
  const reportedLoadFailureRef = useRef(null)

  // IFCSlice
  const model = useStore((state) => state.model)
  const setIsModelLoading = useStore((state) => state.setIsModelLoading)
  const isModelReady = useStore((state) => state.isModelReady)
  const setIsModelReady = useStore((state) => state.setIsModelReady)
  const setModel = useStore((state) => state.setModel)
  const setIndexedModel = useStore((state) => state.setIndexedModel)

  // NavTreeSlice
  const expandedTypes = useStore((state) => state.expandedTypes)
  const setDefaultExpandedElements = useStore((state) => state.setDefaultExpandedElements)
  const setDefaultExpandedTypes = useStore((state) => state.setDefaultExpandedTypes)
  const setExpandedElements = useStore((state) => state.setExpandedElements)
  const setExpandedTypes = useStore((state) => state.setExpandedTypes)

  // RepositorySlice
  const modelPath = useStore((state) => state.modelPath)

  // UISlice
  const setAlert = useStore((state) => state.setAlert)
  const setIsCutPlaneActive = useStore((state) => state.setIsCutPlaneActive)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const setVh = useStore((state) => state.setVh)
  const vh = useStore((state) => state.vh)

  // Begin useState //
  // IFC
  const [elementsById] = useState({})
  const [isViewerLoaded, setIsViewerLoaded] = useState(false)
  // UI elts
  const theme = useTheme()

  // Drag and Drop
  // Add a new state for drag over effect

  // Begin Hooks //
  const isMobile = useIsMobile()
  const location = useLocation()
  // Auth
  const {isLoading: isAuthLoading, isAuthenticated} = useAuth0()
  // The latest auth state, for model_view's tier, which is read after auth
  // settles rather than when the load that sends it began (see the
  // trackModelActionWhenAuthSettled call in loadModel), and by loadModel
  // itself, which runs from a closure that may predate auth settling.
  // Synced in an effect: CadView's effects run before BaseRoutes' (a parent)
  // sets isAuthResolved, so once waitForAuthSettled returns this already
  // holds the settled value.
  const isAuthenticatedRef = useRef(isAuthenticated)
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated
  }, [isAuthenticated])
  // Soft quota gate for models opened straight from a URL (codex P1 on
  // Share#1971): records the load, never blocks it. Called after each
  // successful load below.
  const meterDirectLinkLoad = useDirectLinkQuota(appPrefix)
  const setOpfsFile = useStore((state) => state.setOpfsFile)
  const navigate = useNavigate()
  // TODO(pablo): Removing this setter leads to a very strange stack overflow
  const [searchParams] = useSearchParams()
  const isAssistEnabled = useExistInFeature('assist')
  const isEngineWorkerEnabled = useExistInFeature('engineWorker')

  // Begin helpers //
  /**
   * Begin setup for new model. Turn off nav, search and item and init
   * new viewer.
   */
  function onModelPath() {
    // TODO(pablo): First arg isn't used for first time, and then it's
    // newMode for the themeChangeListeners, which is also unused.
    const initViewerCb = (any, themeArg) => {
      const sceneBackground = themeArg?.palette?.primary?.sceneBackground
      if (!sceneBackground) {
        const error = new Error(`Theme sceneBackground is undefined. themeArg: ${JSON.stringify(themeArg)}`)
        console.error(error.message)
        captureException(error)
      }
      const initializedViewer = initViewer(pathPrefix, sceneBackground || '#abcdef')
      // Apply the persisted §6e render look (profile-menu toggle). Runs on
      // every (re)init — including theme changes, which re-create the viewer —
      // so the chosen look survives re-creation.
      initializedViewer.applyLook?.(getRenderMode() ?? DEFAULT_LOOK)
      setViewer(initializedViewer)
    }
    // Don't call first time since component states get set from permalinks
    if (isModelReady) {
      resetState()
    }
    if (previousThemeChangeCbRef.current) {
      theme.removeThemeChangeListener(previousThemeChangeCbRef.current)
    }
    previousThemeChangeCbRef.current = initViewerCb
    initViewerCb(undefined, theme)
    theme.addThemeChangeListener(initViewerCb)
  }


  /** When viewer is ready, load IFC model. */
  async function onViewer() {
    if (isOpfsAvailable === null) {
      debug().warn('Do not have opfs status yet, waiting.')
      return
    }

    if (viewer === null) {
      debug().warn('CadView#onViewer, viewer is null')
      return
    }

    // NB: no auth precondition here. onViewerInternal itself waits a bounded
    // grace for auth to settle (GitHub loads only) and retries authed when an
    // anonymous attempt fails auth-shaped — so a slow Auth0 exchange can no
    // longer hold the load (and its progress UI) hostage.

    // Past the early returns — we're actually going to load. The in-flight
    // guard sits HERE (not at the effect-callback level) so two effect ticks
    // whose onViewer would both return early — e.g. initial mount in
    // Playwright where viewer is still null at the [auth]-effect's render —
    // don't accidentally claim the slot and starve the eventual successful
    // load from the [viewer] effect.
    if (onViewerInFlightRef.current) {
      if (inFlightModelKeyRef.current !== modelIdentity(modelPath, installPrefix)) {
        debug().warn('CadView#onViewer: model changed mid-load; loading it once the current load ends')
        isViewerReloadPendingRef.current = true
        return
      }
      debug().warn('CadView#onViewer: already in flight; skipping duplicate')
      return
    }
    onViewerInFlightRef.current = true
    inFlightModelKeyRef.current = modelIdentity(modelPath, installPrefix)
    alertAtLoadStartRef.current = useStore.getState().alert
    try {
      await onViewerInternal()
    } finally {
      onViewerInFlightRef.current = false
      inFlightModelKeyRef.current = null
      if (isViewerReloadPendingRef.current) {
        isViewerReloadPendingRef.current = false
        if (useStore.getState().alert !== alertAtLoadStartRef.current) {
          setAlert(null)
        }
        // The load that just ended was superseded. If the replay is for
        // another model, its isLoadSuperseded guard already kept it from
        // writing the per-model state. But after A → B → A the replay is for
        // the SAME model, so the guard counted the ended load as current
        // again, and it may have marked itself loaded for geometry it put into
        // a viewer that has since been disposed. Clear that state before the
        // replay, so a replay that fails, or an auth change during it, still
        // gets retried (codex review on #2026).
        forgetLoadedModel()
        await latestOnViewerRef.current()
      }
    }
  }
  latestOnViewerRef.current = onViewer


  /**
   * Drop the state that belongs to the model this CadView last loaded:
   * - `isViewerLoaded`, which gates the auth/OPFS retry effect. Left true from
   *   the previous model, it kept that effect from ever retrying a later one
   *   (open-205, #2015).
   * - The element lookup, that model's tree (#2016). Cleared in place: it is
   *   one object for the life of this CadView, and the handlers that read it
   *   hold that object. onModel refills it.
   * - A tree brought up at the index of a load the user has now left
   *   (open-205 #2029; codex review on #2037). That load still runs to its end
   *   (#2019), and until it does the new model can't start, so without this
   *   the panels would go on serving the left model's tree and properties
   *   under the new model's URL, with the loading overlay lifted.
   *
   * Runs when the model identity changes, and again just before a replay
   * of a load that a model change superseded (onViewer's finally). Two
   * mechanisms, because a superseded load is not cancelled (#2019): its
   * `isLoadSuperseded` guard (onViewerInternal) keeps it from writing this
   * state back while another model is shown, and the replay-time call
   * covers a return to its own model (A → B → A), where the guard sees it as
   * current again.
   */
  function forgetLoadedModel() {
    setIsViewerLoaded(false)
    for (const id of Object.keys(elementsById)) {
      delete elementsById[id]
    }
    // The left load's first mesh lifted the overlay (#2043); the model about
    // to be shown has put nothing on screen yet. Its pick, if any, goes too.
    useStore.getState().setIsFirstMeshShown(false)
    pendingPreviewPickRef.current = null
    previewPickedRef.current = false
    // Nothing indexed belongs to the model about to be shown: its own load
    // hasn't started (identity change), or hasn't been replayed yet.
    if (useStore.getState().indexedModel !== null) {
      forgetIndexedTree()
    }
  }


  /** Inner load body — preconditions checked + in-flight flag managed by `onViewer`. */
  async function onViewerInternal() {
    // Whether the model shown now is another one. Nothing cancels this load
    // when the user moves on (#2019), and it can still settle at any await
    // below, before or after the replacement's own load begins; checked at
    // each write of the per-model state forgetLoadedModel drops, so a
    // superseded load leaves that state to the model shown (codex review on
    // #2026). By identity, so it reads current again after A → B → A; the
    // replay-time forgetLoadedModel in onViewer covers that case. Read at the
    // write, not here: on mount the [modelPath] effect, which sets the shown
    // identity, runs after the auth effect that may start this load.
    const loadModelKey = modelIdentity(modelPath, installPrefix)
    const isLoadSuperseded = () => dedupeModelKeyRef.current !== loadModelKey
    setIsModelReady(false)
    // open-205 #2043: the canvas is live from the load's first preview mesh,
    // during the parse, so scene picks are too: the handler takes picks on
    // the preview (canvasDoubleClickHandler) until the finished model is in.
    // onModel installs it again at the end, as before.
    pendingPreviewPickRef.current = null
    previewPickedRef.current = false
    window.ondblclick = canvasDoubleClickHandler

    // define mesh colors for selected and preselected element
    const preselectMat = new MeshLambertMaterial({
      transparent: true,
      opacity: 0.5,
      color: theme.palette.primary.sceneHighlight,
      depthTest: true,
    })
    const selectMat = new MeshLambertMaterial({
      transparent: true,
      color: theme.palette.primary.sceneHighlight,
      depthTest: true,
    })

    if (viewer.selector?.hasForkSelector) {
      viewer.selector.setPreselectionMaterial(preselectMat)
      viewer.selector.setSelectionMaterial(selectMat)
    }

    debug().log('CadView#onViewer: modelPath:', modelPath)

    // Progress overlay up BEFORE any auth/token waiting. Previously the
    // overlay only appeared once loadModel ran, and loadModel sat behind
    // full auth resolution — a slow Auth0 exchange meant ~10s of frozen
    // screen with no feedback. loadModel refines the message once it runs.
    setIsModelLoading(true)
    setSnackMessage('Loading model...')

    // Only GitHub-hosted models use the Auth0-brokered token; local files,
    // other external URLs, and Drive (its own connection tokens) shouldn't
    // wait on it at all. Mirror Loader#load's own detection
    // (`pathUrl.host === 'github.com'`) rather than testing `gitpath`:
    // /share/v/gh routes carry a github.com downloadUrl AND a gitpath, but a
    // generic /share/v/u route can point at github.com too and has no
    // gitpath — it still goes through the token-authed Contents API in the
    // loader, so it needs the same grace + authed retry. Non-URL targets
    // (local paths, upload UUIDs) throw in the URL constructor → not GitHub.
    let needsGithubAuth = false
    try {
      needsGithubAuth = new URL(modelPath.downloadUrl || modelPath.filepath).host.toLowerCase() === 'github.com'
    } catch {
      // Relative/local path — not GitHub-hosted.
    }
    // A Drive route with a Drive connection waits too: loadModel uses the
    // connection only for a signed-in user (a private model needs a Bldrs
    // sign-in AND the provider's authorization, design/new/quotas.md §"What
    // counts"), so it has to know which this user is. Without a connection
    // there is nothing to decide; the API-key path is public files only.
    const needsDriveAuth = modelPath.kind === 'provider' && modelPath.provider === 'google' &&
      connections.some((c) => c.providerId === 'google-drive')
    const isAuthSettledBeforeLoad = (needsGithubAuth || needsDriveAuth) ?
      await waitForAuthSettled(AUTH_SETTLE_GRACE_MS) :
      true

    // Hidden state belongs to one model: a different path drops it, a viewer
    // re-init of the same path (a theme change) keeps it for the reapply after
    // the load. Before the load, since `loadModel` hands the model to the
    // isolator, whose `setModel` may seed it (scene-graph loader defaults).
    useStore.getState().claimHiddenElementsForModel(modelIdentity(modelPath, installPrefix))

    // open-205 #2029: bring the tree, properties and search up from the
    // model's index, while geometry still streams, instead of after the last
    // mesh. The loader calls onIndexed between the deferred open and the
    // geometry pump and does NOT wait for it (conwayDirectIfcLoader.js
    // #parseIfcWithConway says why): the tree walk runs beside the pump and
    // its tree installs whenever the walk finishes, which on a small or
    // resident model can be after the geometry. Only for Conway (IFC/STEP)
    // cache misses on the streaming path; every other load brings the tree up
    // in onModel, as before.
    //
    // One install path: the end-of-load code below waits for this delivery
    // and onModel reuses its tree (`indexedTree`), walking the finished model
    // only when the index delivered none. `indexedHandle` is this load's
    // handle, cleared from the store once the finished model is in.
    let indexedTree = null
    let indexedHandle = null
    let indexedDelivery = null
    // A walk can settle after the load has failed, as well as after the user
    // has left: neither may install its tree.
    let hasLoadFailed = false
    // Why the index's walk failed, for the load's end to report once.
    let indexedWalkError = null
    const isIndexedTreeStale = () => isLoadSuperseded() || hasLoadFailed
    const deliverIndexedTree = async (indexedModel) => {
      if (isIndexedTreeStale()) {
        return
      }
      const rootElt = await readModelTree(indexedModel, {
        isIndexed: true,
        onIndexedFailure: (e) => {
          indexedWalkError = e
        },
      })
      if (rootElt === null || isIndexedTreeStale()) {
        return
      }
      if (await installModelTree(indexedModel, rootElt, isIndexedTreeStale, {indexedModel})) {
        indexedTree = rootElt
        // A pick made on the preview before this tree existed (#2043) can now
        // be resolved against it: its row, its URL path, its properties.
        resolvePendingPreviewPick()
      }
    }
    const onIndexed = (indexedModel) => {
      indexedHandle = indexedModel
      indexedDelivery = deliverIndexedTree(indexedModel).catch((e) => {
        // The end-of-load path reads the tree from the finished model then.
        console.warn('CadView#onIndexed: tree not installed at the index:', e)
      })
      return indexedDelivery
    }

    let tmpModelRef
    let isOOM = false
    // Read before the attempt so the catch can tell whether a load reporter
    // began for THIS attempt (getLoadFailureInfo).
    const loadSerialBefore = currentLoadSerial()
    const stopWatchingCamera = watchCameraTakenDuringLoad()
    // Paint on demand for the whole load, not only the progressive session's
    // part of it (three/renderDemand.js): before the session begins, the
    // download and the OPFS staging run under the overlay with nothing new
    // to draw, and on software GL sixty paints a second of the empty scene
    // took PSB's `Opening model` from 13 s to 48 s after navigation
    // (design/new/in-app-model-switch.md §4.2a). The session opens its own
    // scope for the parse, which its finish or abort closes without closing
    // this one (renderDemand.js: scopes nest), so a retried attempt stays on
    // demand; the finally below closes this one on every path, so a load
    // can't leave the loop on demand.
    const endOnDemand = viewer.context.getRenderDemand?.()?.begin(viewer.context.getCameraControls?.())
    // open-205 #2043: the loading overlay lifts at the load's first mesh, but
    // only for the load that is still shown. Nothing cancels a load the user
    // has left (#2019), and its first mesh, which arrives in a viewer since
    // disposed, must not lift the overlay over the next model's empty one
    // (codex review on #2052). The same guard as every other per-model write.
    const onFirstMesh = () => {
      if (!isLoadSuperseded()) {
        useStore.getState().setIsFirstMeshShown(true)
      }
    }
    try {
      tmpModelRef = await loadModelWithAuthRetry(modelPath, isAuthSettledBeforeLoad, {onIndexed, onFirstMesh})
    } catch (e) {
      // A tree that came up at the index belongs to a model that then never
      // loaded: take it down with the load, so the panels don't offer rows of
      // a model that isn't there, and with it any selection made in it, which
      // Properties and the TopBar would otherwise keep showing (codex review
      // on #2037). A walk still running stays out: isIndexedTreeStale.
      hasLoadFailed = true
      if (indexedTree !== null && !isLoadSuperseded()) {
        forgetIndexedTree()
        forgetIndexedSelection()
      } else if (previewPickedRef.current && !isLoadSuperseded()) {
        // The same for a pick on the preview of a load that never indexed
        // (#2043): its element is in no model that is coming.
        forgetIndexedSelection()
      }
      pendingPreviewPickRef.current = null
      if (isOutOfMemoryError(e)) {
        isOOM = true
      }
      // GA's view of a load that did not display: the other half of
      // real_model_open, which only ever sees successes. Sent from here, the
      // one place every failure of an attempt lands, and not from loadModel's
      // own catch, which also sees the auth-shaped first try that
      // loadModelWithAuthRetry then retries and may well win: that is not a
      // failed load, and counting it would. The same isRealModelOpen guard as
      // the success event, so the homepage demo never reports. Deduped per
      // model like the schema refusal below, because the auth-state effect
      // re-runs onViewer for the same route after a failure. Closed-set
      // params only (loadAnalytics#loadFailureParams).
      const failureKey = modelIdentity(modelPath, installPrefix)
      if (isRealModelOpen(modelPath) && reportedLoadFailureRef.current !== failureKey) {
        reportedLoadFailureRef.current = failureKey
        const {phase, fileSize, format} = getLoadFailureInfo(loadSerialBefore)
        gtagFunnelEvent(FUNNEL_EVENTS.LOAD_FAILED, loadFailureParams({error: e, format, fileSize, phase}))
      }
      if (isOOM) {
        // Provide actionable OOM alert object; AlertDialog will render a Refresh button.
        setAlert({
          type: 'oom',
          message: 'We ran out of memory attempting to load this model. ' +
            'Try opening it on a desktop browser with more memory or ' +
            'refresh the page.',
        })
      } else if (e instanceof UnsupportedSchemaError) {
        // conway refused the model's schema by design (IFC4X3 content it
        // can't read correctly — bldrs-ai/conway#713), not because the file
        // or the engine is broken. Say what happened in the user's terms
        // instead of the raw "OpenModel returned -1".
        setAlert({type: 'unsupportedSchema', message: e.message})
        // Counted, not reported as a defect: an info-level message grouped
        // by schema, to rank the IFC 4.3 work (Share#1879). The
        // captureException below stays skipped for it.
        const refusalKey = modelIdentity(modelPath, installPrefix)
        if (reportedRefusalRef.current !== refusalKey) {
          reportedRefusalRef.current = refusalKey
          reportUnsupportedSchema(e, modelPath)
        }
      } else if (e instanceof ZipArchiveError) {
        // A hosted `.ifczip` that isn't one IFC in a readable zip
        // (loader/modelArchive.js#unwrapIfcZip). The user's file, not a
        // defect: say why under its own header, counted in analytics only
        // (AlertDialog), and kept out of the captureException below. The
        // message never names the file.
        setAlert({type: ARCHIVE_UNREADABLE, message: e.message})
      } else if (e instanceof EngineOpenFailureError) {
        // conway said why the open failed (conway#742): a short form of the
        // reason in place of the raw "OpenModel returned -1". Still a real
        // failure, so it keeps the help footer and the Sentry capture below.
        setAlert({type: 'engineFailure', message: e.alertMessage})
      } else if (e instanceof NeedsReconnectError) {
        // Deep-link / reload landed on a Drive route with a stale token, and
        // GIS couldn't escalate to a popup outside a user gesture. Surface a
        // Reconnect button (a future user gesture) instead of "Failed to
        // parse model".
        setAlert({
          type: 'needsReconnect',
          connection: e.connection,
          message: 'Your Google Drive session expired. Reconnect to load this file.',
        })
      } else if (e instanceof InMemoryUploadGoneError) {
        // No OPFS and this page doesn't hold the file (#1906). Distinct from
        // the next case, where OPFS exists but lacks the entry.
        setAlert(inMemoryUploadGoneAlert())
      } else if (e instanceof UploadNotInBrowserError) {
        // A /v/local-only/ URL whose upload this browser never held or no longer
        // holds (#1955). Explain it and offer to open a file, instead of
        // the worker's raw "Folder <id> not found" under an Error header.
        setAlert(uploadNotInBrowserAlert())
        // Counted at info level, not captured as a defect: see
        // reportUploadNotInBrowser. Once per route, like a schema refusal.
        const goneKey = `upload-not-in-browser:${modelIdentity(modelPath, installPrefix)}`
        if (reportedRefusalRef.current !== goneKey) {
          reportedRefusalRef.current = goneKey
          reportUploadNotInBrowser()
        }
      } else {
        setAlert(e)
      }

      console.error(e)
      // Don't send the OOM/device-too-constrained case to Sentry's error
      // stream: it's an expected, handled outcome on memory-constrained
      // devices, already surfaced to the user with actionable advice (the
      // 'oom' alert above). Capturing it generated the SHARE-RS noise
      // (11k+ events / 2.7k users, ~100% old Android) — a device limit, not
      // a code defect. Real (non-OOM) loader failures are still captured,
      // and get load.* tags + context from the last progress event first
      // (via attachLoadFailureContext), so they group by phase in Sentry
      // instead of landing in one detail-free "model loading failed"
      // bucket (conway #301 §7).
      // Same for an unsupported schema: an intended, documented limit that
      // is already explained to the user, not a defect for triage. And for
      // an in-memory upload whose page is gone: a known limit of browsers
      // without OPFS (#1906), counted in analytics by AlertDialog. And for
      // an upload that isn't in this browser (OPFS present, entry absent):
      // the loader only raises it after OPFS confirmed the entry is absent,
      // so it's user state, not a bug — and it was SHARE-1NR, the top
      // hard-failure group (#1955). Its volume is still counted: an
      // info-level message above, plus AlertDialog's analytics event.
      if (!isOOM && !(e instanceof UnsupportedSchemaError) && !(e instanceof InMemoryUploadGoneError) &&
          !(e instanceof UploadNotInBrowserError) && !(e instanceof ZipArchiveError)) {
        attachLoadFailureContext()
        if (e instanceof EngineOpenFailureError) {
          // The engine's status and reason as tags/context on this event
          // only; the alert's GA count is AlertDialog's (trackAlertEvent).
          captureException(e, engineFailureCaptureContext(e))
        } else {
          captureException(e)
        }
      }
      return
    } finally {
      // Whatever the outcome, this load attempt is over. The overlay/snack
      // may still be up (set before the grace wait above, or re-set by the
      // authed-retry path after loadModel's own finally cleared it) — a
      // load that ends in an alert must not leave the LoadingBackdrop
      // blocking the error dialog.
      setIsModelLoading(false)
      setSnackMessage(null)
      stopWatchingCamera()
      endOnDemand?.()
    }
    if (!tmpModelRef && !isOOM) {
      setAlert('Failed to parse model')
      return
    }

    debug().log('CadView#onViewer: pathToLoad(${pathToLoad}), tmpModelRef: ', tmpModelRef)
    // The index's tree walk runs beside the pump and can outlast it. Wait for
    // it, so the tree installs once — from the index, or else in onModel —
    // and never twice in a race. The model is not ready until its tree is,
    // as before: prod walks the tree here too.
    if (indexedDelivery !== null) {
      await indexedDelivery
    }
    // Reuse the index's tree only while it is still the one shown: an
    // auth retry (loadModelWithAuthRetry) may have replaced the attempt
    // that delivered it.
    const earlyTree = indexedTree !== null && useStore.getState().rootElement === indexedTree ?
      indexedTree : null
    // At most one walk of this model's tree (codex review on #2037): on PSB a
    // walk was ~86 s before conway#753 and is still seconds after it, and
    // this load holds the next one back until it ends. So
    // none here when the load is superseded (it would install nothing), and
    // none when the index's walk failed (report that failure instead). A
    // walk that came up with a tree has delivered it (earlyTree).
    if (indexedWalkError !== null && !isLoadSuperseded()) {
      reportTreeReadFailure(indexedWalkError)
    }
    const mayWalk = !isLoadSuperseded() && indexedWalkError === null
    await onModel(tmpModelRef, isLoadSuperseded, earlyTree, {mayWalk})
    // The finished model now answers everything the indexed one did, and it
    // is what readers should hold from here (store/IFCSlice.js
    // #selectReadModel). Only this load's own handle: a superseded load still
    // runs to its end (#2019), and must not take down the shown model's.
    if (indexedHandle !== null && useStore.getState().indexedModel === indexedHandle) {
      setIndexedModel(null)
    }

    const pathToLoad = modelPath.srcUrl || modelPath.gitpath || (installPrefix + modelPath.filepath)
    selectElementBasedOnFilepath(pathToLoad)
    // A pick on the preview (#2043) whose tree came up only now, in onModel —
    // the index delivered none — resolves against it here.
    const wasPickedInPreview = previewPickedRef.current
    if (!isLoadSuperseded()) {
      resolvePendingPreviewPick()
    }
    if ((earlyTree !== null || wasPickedInPreview) && !isLoadSuperseded()) {
      // Anything selected while geometry streamed — a tree row, a search, a
      // link's element path applied as the tree came up, a pick on the parse's
      // preview meshes — highlighted nothing on the model, there being no
      // model in the scene to highlight. The preview it was painted on is gone
      // now: paint it on the finished model.
      reapplySelectionToGeometry()
    }
    previewPickedRef.current = false
    // maintain hidden elements if any
    const previouslyHiddenELements = Object.entries(useStore.getState().hiddenElements)
      .filter(([, value]) => value === true).map(([key]) => Number(key))
    if (previouslyHiddenELements.length > 0) {
      viewer.isolator.unHideAllElements()
      viewer.isolator.hideElementsById(previouslyHiddenELements)
    }
    // A link's hide / isolate terms (`#d:hide=…,iso=…`) win over the above:
    // on a cold load there is nothing above, and on a re-init the writer has
    // kept the terms current. After onModel, which sets the NavTree root
    // that STEP occurrence refs resolve against; before setIsModelReady,
    // which lets VisibilityHashWriter start rewriting the terms.
    // The selection goes first: isolating leaves the selection it finds
    // unpainted, as it does live.
    if (viewer.isolator?.ifcModel) {
      selectFromSelectionHash()
      applyVisibilityHash(window.location, viewer, useStore.getState().rootElement)
    }

    modelPath.title = tmpModelRef.name // maybe undefined
    if (!isLoadSuperseded()) {
      setIsViewerLoaded(true)
    }
    setIsModelReady(true)
    // After the model is on screen, never before: a direct link is metered
    // but not gated (quota/useDirectLinkQuota.js). The Open dialog already
    // recorded what it opened, which the hook sees as alreadyCounted. For
    // Drive, only a download of THIS file says how it was fetched; anything
    // else is left undefined, which the meter counts as private.
    const driveDownload = driveDownloadRef.current?.fileId === modelPath.fileId ?
      driveDownloadRef.current : undefined
    meterDirectLinkLoad(modelPath, driveDownload)

    let lastSent = 0
    /** Debounced function to track model interaction for GA. */
    function trackModelInteraction() {
      const now = Date.now()
      const debounceWaitMs = 10000
      if (now - lastSent > debounceWaitMs) { // e.g. send once every 10s
        gtagEvent('model_interact', {
          interaction_type: 'rotate_or_zoom',
        })
        lastSent = now
      }
    }

    const cameraControls = viewer.context.getCameraControls()
    // Our visual testing waits until animations are finished to take screenshot
    // Would like to use zero but doesn't work
    // viewer.context.getCameraControls().restThreshold = 0.1
    cameraControls.addEventListener('rest', () => {
      trackModelInteraction()
    })
  }


  /**
   * loadModel wrapper for the auth-slow path: when the attempt went out
   * before auth settled (grace window in onViewerInternal expired), wait for
   * auth and retry once with what it brings. Per provider:
   *
   * - GitHub: only a failure that is auth-shaped — GitHub masks private
   *   repos as 404 to anonymous callers and rate-limits anonymous IPs with
   *   403 — and only once a GitHub token has landed.
   * - Drive: the attempt read as signed out, so it took the API-key path,
   *   which only serves link-shared files (loadModel never uses a Drive
   *   connection while signed out). If auth then settles signed in and a
   *   Drive connection is saved, retry through the connection. Any failure
   *   qualifies: the API-key download's error has no reliable status, and
   *   this is one retry. Without it a Google-only user's restricted link
   *   stayed failed until a reload, because the auth-state effect's
   *   onViewer is dropped while this load is in flight (codex review on
   *   Share#1977).
   *
   * Everything else rethrows to onViewerInternal's catch unchanged.
   *
   * @param {object} routeResult
   * @param {boolean} isAuthSettledBeforeLoad
   * @param {object} [loadOptions] passed to every attempt's loadModel
   * @return {object} loaded model
   */
  async function loadModelWithAuthRetry(routeResult, isAuthSettledBeforeLoad, loadOptions = {}) {
    try {
      return await loadModel(routeResult, loadOptions)
    } catch (error) {
      if (isAuthSettledBeforeLoad) {
        throw error
      }
      if (routeResult.kind === 'provider' && routeResult.provider === 'google') {
        setIsModelLoading(true)
        await waitForAuthSettled(AUTH_SETTLE_RETRY_MS)
        const hasDriveConnection = useStore.getState().connections.some((c) => c.providerId === 'google-drive')
        if (!isAuthenticatedRef.current || !hasDriveConnection) {
          // Settled signed out (or nothing to retry with): the API-key
          // failure was the real answer.
          throw error
        }
        debug().log('CadView#loadModelWithAuthRetry: Drive load ran before sign-in settled; retrying via connection')
        return await loadModel(routeResult, loadOptions)
      }
      if (!isAuthShapedLoadError(error)) {
        throw error
      }
      // loadModel's finally just cleared the overlay; keep it up while we
      // wait for the token — to the user this is still the same load.
      setIsModelLoading(true)
      await waitForAuthSettled(AUTH_SETTLE_RETRY_MS)
      if (!useStore.getState().accessToken) {
        // Auth settled without a GitHub token (logged out, Google-only) —
        // the anonymous failure was the real answer.
        throw error
      }
      debug().log('CadView#loadModelWithAuthRetry: anonymous load failed auth-shaped; retrying with token')
      return await loadModel(routeResult, loadOptions)
    }
  }


  /**
   * Load IFC helper used by 1) useEffect on path change and 2) upload button
   *
   * @param {object} routeResult
   * @param {object} [options]
   * @param {Function} [options.onIndexed] handed the model at its index while
   *   geometry still streams (open-205 #2029); see onViewerInternal
   * @param {Function} [options.onFirstMesh] called when a progressive load's
   *   first geometry is on screen (open-205 #2043); see onViewerInternal
   * @return {object} loaded model
   */
  async function loadModel(routeResult, {onIndexed, onFirstMesh} = {}) {
    const isGoogleResult = routeResult.kind === 'provider' && routeResult.provider === 'google'
    const filepath = isGoogleResult ? routeResult.downloadUrl : (routeResult.downloadUrl || routeResult.filepath)
    const gitpath = routeResult.gitpath
    // Without OPFS a local file lives only in the memory of the page that
    // opened it (loader/inMemoryUploads.js, #1906). A /v/local-only/ URL this page
    // doesn't hold — a reload, or the link opened anywhere else — can't load,
    // so say that rather than let the Loader fetch a blob URL that never
    // existed here. The route, not the Loader's `testUuid` heuristic, decides
    // what is an upload: a Drive blob URL and a hosted `<uuid>.ifc` pass that
    // test too.
    if (routeResult.isUploadedFile === true && isOpfsAvailable === false) {
      const storageId = routeResult.filepath.split('/').pop()
      if (!hasInMemoryUpload(storageId)) {
        throw new InMemoryUploadGoneError(storageId)
      }
    }
    const loadingMessageBase = `Loading ${isGoogleResult ? routeResult.fileId : filepath}`
    setIsModelLoading(true)
    setSnackMessage(`${loadingMessageBase}`)

    // Call this before loader, as IFCLoader needs it.
    viewer.setCustomViewSettings(customViewSettings)

    // Per-load progress reporter (conway #301): accumulates the normalized
    // load-log report (status-bar expando + post-load dialog + console
    // mirror), Sentry breadcrumbs, and the stall watchdog. Disposed in the
    // finally below. Live progress renders in the snackbar (AlertDialogAndSnackbar),
    // so the snackbar keeps only the base "Loading <file>" message.
    beginLoadProgress({
      fileInfo: isGoogleResult ? `gdrive:${routeResult.fileId}` : filepath,
      onStall: (lastEvent) => {
        const where = lastEvent?.phase ? ` on ${lastEvent.phase}` : ''
        setSnackMessage(`${loadingMessageBase}: still working${where}…`)
      },
    })

    const onProgress = (progressMsg) => reportLoadProgress(progressMsg)
    let loadedModel
    // Captured in the catch so the finally can tell endLoadProgress whether
    // the load succeeded (success grace line) or failed (error grace line),
    // even though the error is re-raised to onViewerInternal's handler.
    let loadError = null
    try {
      if (isGoogleResult) {
        // Never a Drive connection while signed out: its token may outlive the
        // Bldrs session (it is in localStorage), and using it would open a
        // restricted file to someone the quota can't meter. Signed out takes
        // the API-key path below, which only serves link-shared files, so a
        // restricted one fails with the usual alert. Sign-out also clears the
        // connection outright (connections/useSignedOutDriveCleanup.js); this
        // covers a load that starts before that runs. If auth hadn't settled
        // within onViewerInternal's grace, this attempt reads as signed out,
        // and loadModelWithAuthRetry retries through the connection once auth
        // settles signed in.
        const connection = isAuthenticatedRef.current ?
          connections.find((c) => c.providerId === 'google-drive') :
          undefined
        driveDownloadRef.current = {fileId: routeResult.fileId, connection: connection || null}
        // The same record for the export side (quota/driveExportVisibility.js),
        // which classifies a Drive file's sharing from it as the meter does.
        useStore.getState().setModelDriveDownload(driveDownloadRef.current)
        if (connection) {
          // OAuth path: authenticated download for private files
          const browser = getBrowser('google-drive')
          const download = await browser.getFileDownload(connection, null, routeResult.fileId)
          const blobUrl = URL.createObjectURL(download.blob)
          try {
            loadedModel = await load(blobUrl, viewer, onProgress, false, setOpfsFile, '',
              {onIndexed, onFirstMesh})
          } finally {
            // The URL pins the whole download for the life of the page, and
            // each load mints a new one (a theme toggle reloads the model).
            // `load` has read the bytes into memory by the time it settles,
            // and a retry downloads again, so nothing needs this URL after
            // (open-205, #2018).
            URL.revokeObjectURL(blobUrl)
          }
        } else {
          // API key fallback: works for public files and route tests without a
          // connection. Only a file shared "Anyone with the link" (or
          // published) downloads this way, which is why the quota meter
          // treats a Drive file loaded here as public.
          loadedModel = await load(routeResult.downloadUrl, viewer, onProgress, false, setOpfsFile, '',
            {onIndexed, onFirstMesh})
        }
      } else {
        // Read the token at call time, not from the render closure — the
        // auth grace/retry flow in onViewerInternal can land a token
        // mid-flight, and the closure would still hold the pre-resolution
        // (usually empty) value.
        const tokenNow = useStore.getState().accessToken
        loadedModel = await load(filepath, viewer, onProgress,
          (gitpath && gitpath === 'external') ? false : isOpfsAvailable, setOpfsFile, tokenNow,
          // Route provenance, which the loader can't recover from `filepath`
          // alone: /v/local-only/<id> and /v/p/<id> give the same URL (#1956).
          {isUploadedRoute: routeResult.isUploadedFile === true, onIndexed, onFirstMesh})
      }
    } catch (error) {
      loadError = error
      if (isOutOfMemoryError(error)) {
        error.isOutOfMemory = true
      }
      // Bubble every loader error up to onViewerInternal's catch so it can
      // (1) set the alert once with the actual Error and (2) capture it
      // once via its captureException call. Previously generic errors
      // were swallowed here with setAlert(error)+return — and then the
      // outer `if (!tmpModelRef && !isOOM)` branch overwrote the alert
      // with the string "Failed to parse model", producing a second
      // Sentry issue (SHARE-N5) for every real loader failure already
      // tracked as SHARE-RS. The previous code already re-threw the
      // typed OOM and NeedsReconnect cases for the same reason; this
      // generalises that pattern to every loader error.
      throw error
    } finally {
      // Freeze the report (Total line) + stall watchdog off. The
      // reporter's last-event state stays queryable after end —
      // onViewerInternal's catch stamps it onto Sentry via
      // attachLoadFailureContext before capturing. The captured error (or
      // null on success) drives the end-of-load grace snackbar.
      endLoadProgress(loadError)
      setIsModelLoading(false)
    }


    // Fix for https://github.com/bldrs-ai/Share/issues/91
    //
    // TODO(pablo): huge hack. Somehow this is getting incremented to
    // 1 even though we have a new IfcViewer instance for each file
    // load.  That modelID is used in the IFCjs code as [modelID] and
    // leads to undefined refs e.g. in prePickIfcItem.  The id should
    // always be 0.
    loadedModel.modelID = 0
    setModel(loadedModel)
    // For App API.  TODO(pablo): doublecheck this method still works with this
    // arg.. expected a url
    updateLoadedFileInfo(filepath)

    viewer.context.getScene().add(loadedModel)
    // First geometry in the scene, for formats with no progressive preview
    // (and GLB cache hits): their one-shot arrival is their first mesh. A
    // no-op when ProgressiveLoadSession already recorded an earlier one.
    reportFirstMesh()

    // Size the dolly range + near/far clip planes to the model *before*
    // any camera pose is applied, so the first frame is already drawn
    // with the right frustum. fitModelToFrame does this too, but a
    // permalink with a `#c:` camera hash skips the fit — and then the
    // model renders against the default far = 2000 plane and the first
    // user input clamps the restored distance to maxDistance = 300
    // (#1652).
    viewer.context.fitCameraLimitsToModel(loadedModel)

    const isCamHashSet = onHash(location, viewer.context.getCameraControls())
    // A user who drove the camera while the model streamed in (open-205
    // #2043: orbit and zoom are live from the first preview mesh) is looking
    // at something; framing the whole model now would yank it away. The
    // limits above are still sized, so the model draws and dollies right.
    // design/new/in-app-model-switch.md §4.2a.
    const isCameraTakenDuringLoad = isCameraTakenDuringLoadRef.current
    // Read once, for this load: loadModel is also called outside
    // onViewerInternal's watch (an upload), which must not see this load's.
    isCameraTakenDuringLoadRef.current = false
    if (!isCamHashSet && !isCameraTakenDuringLoad) {
      // Framing target passed explicitly: the no-arg fallback frames the
      // last scene child, which is the model only by luck of ordering.
      viewer.context.fitModelToFrame(loadedModel)
    }

    // §6e: fit the contact-shadow ground + shadow frustum to the model's
    // bounds (valid now it's added + framed). Optional-chained: the Jest
    // viewer mock doesn't define it.
    viewer.groundModel?.(loadedModel)

    // Framing just ran on outlier-robust bounds (robustBounds.js), and
    // this repeats that cached measurement. If strays were excluded, say
    // so: Health line + console warning + grace-snackbar note. After
    // endLoadProgress by design — it amends the published loadResult.
    // The traverse guard skips the Jest MockModel, which isn't an
    // Object3D.
    if (typeof loadedModel.traverse === 'function') {
      reportFramingExclusion(robustBoundsFor(loadedModel))
    }

    // §6e: apply the active render look's materials to the new model, so a
    // model opened while a non-default look is active still matches.
    viewer.applyLookToModel?.(loadedModel)

    // TODO(pablo): centralize capability check somewhere
    if (loadedModel.ifcManager) {
      await viewer.isolator.setModel(loadedModel)
    } else {
      console.warn('CadView#loadedModel: model without manager:', loadedModel)
    }

    // Replaces the retired `select_content` event, whose counts were
    // conflated with homepage visits because the demo model fired it
    // too. The isRealModelOpen guard keeps that from recurring — see
    // its doc for why the demo must stay out of this event.
    // The successfully loaded model replaces the prior engagement window,
    // including when this load is the bundled demo (which is never tracked).
    stopModelEngagementRef.current?.()
    stopModelEngagementRef.current = null
    // The verdict the real_model_open below reports (load_outcome), read once
    // so the user's message and GA's count cannot disagree about this load.
    const loadOutcome = getCompletedLoadOutcome()
    if (loadOutcome === LOAD_OUTCOMES.NO_GEOMETRY) {
      // The engine read the file and it has nothing to draw (Share#1962): say
      // so in place of leaving an empty viewer unexplained. Not a failure, so
      // no captureException and no load_failed; GA still gets the open, as
      // real_model_open with load_outcome 'no_geometry', and AlertDialog
      // counts the alert. Once per model: the auth-state and view-settings
      // effects re-run onViewerInternal for the same route, and the user has
      // already dismissed it.
      const noGeometryKey = `no-geometry:${modelIdentity(routeResult, installPrefix)}`
      if (reportedRefusalRef.current !== noGeometryKey) {
        reportedRefusalRef.current = noGeometryKey
        setAlert(noGeometryAlert())
      }
    }
    if (isRealModelOpen(routeResult)) {
      const eventParams = {
        content_type: loadedModel.type || 'undefined',
        // The same helper stamps content_id on model_view below, and on
        // model_share / model_export elsewhere, so GA counts one model the
        // same way on every event. Equal to `filepath` above, by design.
        content_id: modelContentId(routeResult),
      }
      // How the load went: the reporter's cross-format snapshot merged with
      // Conway's engine stats for IFC/STEP, plus the displayed/no_geometry/
      // unusable verdict. loadTime stays the reporter's wall clock whatever
      // the engine says; see loadAnalytics#buildOutcomeParams.
      Object.assign(eventParams, buildOutcomeParams({
        completedStats: getCompletedLoadStats() ?? undefined,
        loadStats: loadedModel.loadStats,
        loadOutcome,
      }))
      // Per-user open depth: GA4 has no user-id dimension, so the
      // client id rides along as an event-scoped custom dimension,
      // prefix-tagged by getOpenCid so GA4 can't type it as a number.
      // Absent whenever GA didn't initialize — see analytics#gaClientId.
      const openCid = getOpenCid()
      if (openCid) {
        eventParams[OPEN_CID_PARAM] = openCid
      }
      // GA4's own `hour` dimension is in the *property's* timezone, which
      // says nothing about when a user in Milan or São Paulo actually
      // works — and the real-opens audience is Europe + Brazil (bizdev
      // growth-strategy §2). This is their local hour, prefixed so gtag
      // keeps it in the text slot; see analytics#getLocalHour.
      eventParams[LOCAL_HOUR_PARAM] = getLocalHour()
      gtagEvent(FUNNEL_EVENTS.REAL_MODEL_OPEN, eventParams)
      // The normalized twin, beside — never instead of — real_model_open,
      // which Ads and the dashboard key on. Sent once auth settles, with the
      // auth state of then (privacy/modelActionTracking.js says why: a
      // non-GitHub load doesn't wait for auth, and the auth-change reload is
      // deduped). The route is read now, so a later navigation can't
      // relabel it. Always `gate: 'none'`: a view a soft gate let through
      // over the limit is still an ungated view; the over-limit fact is
      // model_share {gate: 'soft'}. Not awaited.
      trackModelActionWhenAuthSettled(MODEL_ACTIONS.VIEW, {
        gate: MODEL_GATES.NONE,
        ...modelRouteSource(routeResult),
        contentId: eventParams.content_id,
        getIsAuthenticated: () => isAuthenticatedRef.current,
      })
      // Engaged-use conversions (Share#1960). Same real-open gate as the
      // event above; keyed by model so a theme/view-settings reload of the
      // same model is not a second open. Resolves to the events it sent
      // and never rejects, so it is not awaited.
      trackEngagementOnOpen(Date.now(), modelIdentity(modelPath, installPrefix))
      // Give a chip with non-zero errors/warnings a Sentry event to link
      // to (issue #1767). Gated on the very counts just assembled above,
      // because those are what colour the chip: Conway's own
      // stats_errorCount / stats_warningCount when it supplies them
      // (conway#740; it does not yet), else the page-wide console tee the
      // reporter publishes as stats_pageErrorCount / stats_pageWarnCount.
      // Siting the call here is also what keeps it to real, successful
      // opens. See loadProgress#captureLoadDiagnostics.
      captureLoadDiagnostics({
        errorCount: eventParams.stats_errorCount ?? eventParams.stats_pageErrorCount,
        warningCount: eventParams.stats_warningCount ?? eventParams.stats_pageWarnCount,
        contentId: eventParams.content_id,
        contentType: eventParams.content_type,
      })
      stopModelEngagementRef.current = startModelEngagement({
        content_type: eventParams.content_type,
        content_id: eventParams.content_id,
      })
    }

    return loadedModel
  }


  /**
   * Analyze loaded IFC model to configure UI elements.
   *
   * @param {object} m IFCjs loaded model.
   * @param {Function} isLoadSuperseded True once the user has moved to another
   *   model; see onViewerInternal.
   * @param {object|null} [earlyTree] The tree already brought up from this
   *   load's index (open-205 #2029), or null to read it from `m` now.
   * @param {object} [options]
   * @param {boolean} [options.mayWalk] False when `m`'s tree must not be read
   *   here: the load is superseded, so nothing it reads would be installed, or
   *   its index already walked this model's tree (onViewerInternal).
   */
  async function onModel(m, isLoadSuperseded, earlyTree = null, {mayWalk = true} = {}) {
    assertDefined(m)
    debug().log('CadView#onModel', m)
    // TODO(pablo): centralize capability check somewhere
    if (!m.ifcManager) {
      console.warn('CadView#onModel, model without manager:', m)
      return
    }
    window.ondblclick = canvasDoubleClickHandler
    setKeydownListeners(viewer, selectItemsInScene)
    // Everything below here needs the rootElt, which may not be available
    // if we can't read the full model structure.
    if (earlyTree === null) {
      if (!mayWalk) {
        return
      }
      const rootElt = await readModelTree(m, {isIndexed: false})
      if (rootElt === null) {
        return
      }
      await installModelTree(m, rootElt, isLoadSuperseded)
    }
    // Load-time property reads are done: drop Conway's materialised
    // entity/descriptor caches (the 'names' walk + type sweep touched
    // O(products) entities). Entities rematerialise transparently on the
    // next property access (Properties panel, GLB cache writer), so this
    // only bounds memory. Conway extension — optional-chained so older
    // conway versions no-op. The IsModelOpen gate keeps cache-hit GLB
    // loads silent: they share the live conway ifcAPI via
    // `viewer.IFC.loader.ifcManager` without ever opening model 0, and
    // an ungated release would log a spurious model-undefined error.
    // Released here at the load's end even when the tree came up at the
    // index: the walk's entities are what the tree's first property reads
    // hit while the geometry streamed.
    const conwayApi = m.ifcManager?.ifcAPI
    // eslint-disable-next-line new-cap
    if (conwayApi?.ReleaseEntityCache && conwayApi.IsModelOpen?.(0)) {
      // eslint-disable-next-line new-cap
      conwayApi.ReleaseEntityCache(0)
    }
  }


  /**
   * Tell the user the model's tree couldn't be read, and Sentry why.
   *
   * @param {Error} e
   */
  function reportTreeReadFailure(e) {
    setAlert('Could not read full model structure.  Only model geometry will be available.')
    captureException(e, 'Could not read full model structure')
    console.error(e)
  }


  /**
   * Read the spatial tree from `m`, writing nothing to the store. Split from installModelTree so the index path (open-205 #2029) can
   * read the tree, check the load is still current, and only then show it.
   *
   * @param {object} m a loaded model, or the model at its index
   *   (makeIndexedModelHandle): both carry the same spatial surface
   * @param {object} options
   * @param {boolean} options.isIndexed True at the index. A failure there is
   *   logged, handed to `onIndexedFailure` and answers null; the load's end
   *   raises the alert for it, once, and does not walk the tree again.
   * @param {Function} [options.onIndexedFailure] `(error) => void`, at the index
   * @return {Promise<object|null>} the tree root, or null when it can't be read
   */
  async function readModelTree(m, {isIndexed, onIndexedFailure}) {
    let rootElt
    try {
      // Three sources, in preference order:
      //   1. Model's own `getSpatialStructure` (instance method) — attached
      //      by `decorateConwayDirectIfcModel` on cache-miss Conway-direct
      //      parses (routes to `ifcAPI.properties.getSpatialStructure`),
      //      by `makeIndexedModelHandle` on the same parses at their index,
      //      or by `convertToShareModel` on cache-hit GLBs that carry the
      //      `BLDRS_spatial_tree` extension (closure returning the cached
      //      tree). `hasOwnProperty` discriminates this from wit-three's
      //      `IFCModel.prototype.getSpatialStructure` which takes no args
      //      and would silently drop `withProperties=true`.
      //   2. Wit-three's `m.ifcManager.getSpatialStructure(0, ...)` —
      //      legacy fallback. Post-Slice-5b this won't work for IFC
      //      parses (wit-three's `state.models[modelID]` is empty
      //      because we skipped its parse), but the branch stays as a
      //      defensive fallback for non-IFC models that decorated with
      //      `ifcManager` shims via `convertToShareModel`.
      //
      // `'names'` (Conway extension) fetches the tree with only the
      // Name/LongName/GlobalId handles each load-time consumer here
      // actually reads (setupLookupAndParentLinks: expressID;
      // SearchIndex + reifyName: Name/LongName/GlobalId/type;
      // groupElementsByTypes: Name/LongName/type) instead of the old
      // `true`, which flattened and retained every spatial node's FULL
      // attribute record — O(products) memory pinned for the session
      // that the Properties panel re-fetches on demand anyway. The
      // cache-hit GLB closure ignores the flag (tree pre-serialised);
      // wit-three's legacy shim treats any truthy value as `true`.
      const hasOwnSpatialStructure =
        Object.prototype.hasOwnProperty.call(m, 'getSpatialStructure')
      if (hasOwnSpatialStructure) {
        rootElt = await m.getSpatialStructure(0, 'names')
      } else {
        rootElt = await m.ifcManager.getSpatialStructure(0, 'names')
      }
    } catch (e) {
      if (isIndexed) {
        // Reported at the load's end instead (onViewerInternal), once, so a
        // model whose tree can't be read raises one alert.
        console.warn('CadView#readModelTree: tree not readable at the index:', e)
        onIndexedFailure?.(e)
        return null
      }
      reportTreeReadFailure(e)
      return null
    }
    debug().log('CadView#readModelTree: rootElt: ', rootElt)
    if (rootElt.expressID === undefined) {
      if (isIndexed) {
        console.warn('CadView#readModelTree: tree at the index has no root express ID')
        onIndexedFailure?.(new Error('Model has undefined root express ID'))
        return null
      }
      throw new Error('Model has undefined root express ID')
    }
    return rootElt
  }


  /**
   * Bring up a read tree: the element lookup, the search index, the root's
   * display name, the NavTree root and the types view.
   *
   * Writes nothing once the user has moved to another model. The check sits
   * after the one await and before the first write, so every write then lands
   * in one synchronous run and none can republish this model's tree under the
   * next (codex review on #2037). A superseded load is not cancelled (#2019),
   * so it does reach here.
   *
   * @param {object} m the model the tree was read from
   * @param {object} rootElt from readModelTree
   * @param {Function} isLoadSuperseded see onViewerInternal
   * @param {object} [options]
   * @param {object} [options.indexedModel] The model at its index, published
   *   with the tree it was read from (open-205 #2029): before the tree, so the
   *   panels never pair this tree with the model shown before it
   *   (store/IFCSlice.js#selectReadModel).
   * @return {Promise<boolean>} whether the tree was installed
   */
  async function installModelTree(m, rootElt, isLoadSuperseded, {indexedModel = null} = {}) {
    // Root display name, in preference order: real properties from the
    // parser (IFC project Name/LongName), then whatever the tree root
    // already carries (convertToShareModel's composed
    // "<sceneName> (<fileName>)" for plain GLB/OBJ — see #1595), then
    // the generic 'Model' placeholder. The previous unconditional
    // overwrite stamped 'Model' over every non-IFC root because
    // getProperties has nothing for unstructured models. Read before
    // anything is written; applied after the search index is built, which
    // indexes the root under the name it came with, as it always has.
    const tmpProps = await viewer.getProperties(0, rootElt.expressID)
    if (isLoadSuperseded()) {
      return false
    }
    setupLookupAndParentLinks(rootElt, elementsById)
    initSearch(m, rootElt)
    if (tmpProps && (tmpProps.Name || tmpProps.LongName)) {
      rootElt.Name = tmpProps.Name ?? rootElt.Name
      rootElt.LongName = tmpProps.LongName ?? rootElt.LongName
    } else if (!rootElt.Name && !rootElt.LongName) {
      rootElt.Name = {value: 'Model'}
      rootElt.LongName = {value: 'Model'}
    }
    if (indexedModel !== null) {
      setIndexedModel(indexedModel)
    }
    // Ids are only unique within one file — transient anonymous-geometry
    // rows from the previous model must not leak into this tree.
    useStore.getState().clearTransientTreeNodes()
    setRootElement(rootElt)
    setElementTypesMap(groupElementsByTypes(rootElt))
    return true
  }


  /**
   * Take down a tree brought up at the index of a load that then failed
   * (open-205 #2029): with no model behind it, its rows would select, search
   * and show properties for a model that never arrived.
   */
  function forgetIndexedTree() {
    setIndexedModel(null)
    setRootElement(null)
    setElementTypesMap([])
    searchIndex.clearIndex()
    for (const id of Object.keys(elementsById)) {
      delete elementsById[id]
    }
  }


  /**
   * Drop a selection made in the tree of a model the user has left while it
   * was still at its index, or whose load failed after it (open-205 #2029;
   * codex review on #2037): the rows,
   * anchors, instances, occurrence and the Properties element. A model that
   * finished loading has its selection reset by onModelPath's resetState; one
   * left at its index never reached isModelReady, so nothing else would, and
   * if the next model then failed before its own index, the left model's
   * selection and properties stayed up under its URL. Clearing the selection
   * also re-runs the selection effect, whose cleanup marks a property lookup
   * still in flight for the left model stale, so it can't land afterwards.
   *
   * Only on the identity change, never before a replay: the replay is for the
   * model the URL shows, whose `#sel:` link (selectFromSelectionHash) applies
   * once its tree is up, and that selection must stand. The URL is not
   * touched here. #2019's sessions turn this clear into restoring each
   * model's own selection when the user returns to it.
   */
  function forgetIndexedSelection() {
    selectItemsInScene([], false)
    setSelectedElement(null)
  }


  /**
   * Re-run the current selection against the scene, for a selection made
   * while geometry was still streaming (open-205 #2029). At the time, the
   * scene half of it found nothing: `setSelection` had no model to paint, and
   * a STEP row resolved to no instances. The logical selection — the rows,
   * the anchors, the occurrence — is in the store, so this goes back through
   * the same funnel a tree click takes, without touching the URL.
   */
  function reapplySelectionToGeometry() {
    const state = useStore.getState()
    const selected = state.selectedElements
    if (!Array.isArray(selected) || selected.length === 0) {
      return
    }
    const occurrencePath = Array.isArray(state.selectedOccurrencePath) &&
      state.selectedOccurrencePath.length > 0 ? state.selectedOccurrencePath : null
    const solidExpressId = state.selectedSolidExpressId ?? null
    // A tree row's occurrence resolves to its instances only now there are any;
    // with no occurrence, selectItemsInScene resolves the anchors itself. A
    // scene pick's exact instances are kept as they are: the finished model
    // narrows a pick to the instance it hit.
    let isExact = state.selectedInstancesExact === true &&
      Array.isArray(state.selectedInstanceIds) && state.selectedInstanceIds.length > 0
    let instanceIds = isExact ? state.selectedInstanceIds :
      (occurrencePath === null ? [] : occurrenceInstanceIds(occurrencePath, true, solidExpressId))
    const anchors = Array.isArray(state.selectedAnchorIds) && state.selectedAnchorIds.length > 0 ?
      state.selectedAnchorIds.map(Number) : null
    const rootGeometryId = state.selectedRootGeometryId ?? null
    // A root-level pick made before its shell's durable instance existed (a
    // STEP preview pick, #2089) is the product's row plus the shell's
    // geometry. Now there are instances: the shell it hit, as a pick on the
    // finished model selects it (#1909), not the whole product the row means.
    if (!isExact && occurrencePath === null && rootGeometryId !== null) {
      const shells = rootLevelShellInstances(selected, rootGeometryId)
      if (shells.length > 0) {
        instanceIds = shells
        isExact = true
      }
    }
    selectItemsInScene(selected.map(Number), false, instanceIds, occurrencePath, solidExpressId, anchors)
    useStore.getState().setSelectedInstancesExact(isExact)
    useStore.getState().setSelectedRootGeometryId(rootGeometryId)
  }


  /**
   * Restore a link's multi-selection (`#sel:`, selectionHash.js) over the
   * single one its path carries, as a shift-click selection would hold it:
   * the rows as anchors, with their descendants for the scene highlight
   * (`elementSelection`). Rows the tree doesn't have are dropped; nothing
   * resolving leaves the path's selection.
   */
  function selectFromSelectionHash() {
    const refs = readSelectionHash(window.location)
    if (!refs) {
      return
    }
    const anchors = resolveSelectionRefs(refs, viewer).filter((id) => elementsById[id])
    if (anchors.length === 0) {
      return
    }
    // Already the selection (the token was written from it): leave it, with
    // its per-instance highlight.
    const current = new Set((useStore.getState().selectedAnchorIds ?? []).map(String))
    if (current.size === anchors.length && anchors.every((id) => current.has(String(id)))) {
      return
    }
    const ids = new Set()
    for (const id of anchors) {
      ids.add(id)
      getDescendantExpressIds(elementsById[id]).forEach((descendant) => ids.add(descendant))
    }
    selectItemsInScene([...ids], false, [], null, null, anchors)
  }


  /**
   * Select the element of a preview mesh the user double-clicked during a
   * Conway load (open-205 #2043).
   *
   * Once the tree is up (the index, #2029) this is the finished model's pick:
   * `elementSelection`, the same funnel, which writes the URL path and takes
   * the element's descendants for the highlight. Before it there is nothing
   * to resolve the id against, so the bare id is selected — the preview
   * paints it (`ShareViewer#setPreviewSelection`) and the URL is left alone —
   * and the pick waits in `pendingPreviewPickRef` for the tree. Shift is not
   * a multi-select then: a toggle needs the rows it would toggle.
   *
   * @param {number} expressId the picked element
   * @param {boolean} isShiftKeyDown
   */
  function selectFromPreviewPick(expressId, isShiftKeyDown) {
    previewPickedRef.current = true
    if (useStore.getState().rootElement === null) {
      pendingPreviewPickRef.current = expressId
      selectItemsInScene([expressId], false)
      return
    }
    pendingPreviewPickRef.current = null
    if (elementsById[expressId] !== undefined) {
      elementSelection(viewer, elementsById, selectItemsInScene, isShiftKeyDown, expressId)
    } else {
      // A product the tree doesn't list: selected by id, as the finished
      // model's own picks fall back to when the tree has no row for them.
      selectItemsInScene([expressId], false)
    }
  }


  /**
   * Select the row of a durable batch the user double-clicked while it is
   * still streaming in. Once the tree is up this is the finished model's
   * per-instance pick (`selectFromInstancePick`), from the same row, so the
   * selection — element or occurrence, and the instance that narrows its
   * highlight — is the one the finished model will have. Before the tree,
   * like a preview pick: the bare owner id is selected, and the row waits in
   * `pendingPreviewPickRef` for the tree.
   *
   * @param {object} pick `{parentExpressId, instanceId, occurrencePath,
   *   geometryId}` (`streamingPickOf`)
   * @param {boolean} isShiftKeyDown
   */
  function selectFromStreamingPick(pick, isShiftKeyDown) {
    previewPickedRef.current = true
    if (useStore.getState().rootElement === null) {
      pendingPreviewPickRef.current = pick
      // A durable row's instance is the pick's exact narrowing; a STEP
      // preview mesh has no instance yet, only its occurrence, which the
      // preview and the streaming rows are painted by.
      const isRowPick = pick.instanceId !== null && pick.instanceId !== undefined
      selectItemsInScene([pick.parentExpressId], false, isRowPick ? [pick.instanceId] : [],
        pick.occurrencePath?.length > 0 ? pick.occurrencePath : null)
      useStore.getState().setSelectedInstancesExact(isRowPick)
      // A root-level shell (`[]`): no path tells it from the product's other
      // shells, which share its owner; its geometry does.
      const isRootLevel = Array.isArray(pick.occurrencePath) && pick.occurrencePath.length === 0
      useStore.getState().setSelectedRootGeometryId(isRootLevel ? (pick.geometryId ?? null) : null)
      return
    }
    pendingPreviewPickRef.current = null
    selectFromInstancePickRow(pick, isShiftKeyDown)
  }


  /**
   * The per-instance pick funnel for a row read off a durable batch, while
   * it streams (`streamingPickOf`) or once decorated: one translation of a
   * row into `selectFromInstancePick`'s arguments.
   *
   * @param {object} pick `{parentExpressId, instanceId, occurrencePath,
   *   geometryId}`
   * @param {boolean} isShiftKeyDown
   */
  function selectFromInstancePickRow(pick, isShiftKeyDown) {
    selectFromInstancePick({
      parentExpressId: pick.parentExpressId,
      instanceId: pick.instanceId,
      rawOccurrencePath: pick.occurrencePath ?? null,
      isRootLevel: Array.isArray(pick.occurrencePath) && pick.occurrencePath.length === 0,
      pickedGeometryId: pick.geometryId ?? null,
      isShiftKeyDown,
    })
  }


  /**
   * Resolve a preview pick made before the index, now that the tree is up
   * (open-205 #2043): re-select it through the finished model's funnel, which
   * writes its URL path and expands the tree to it, and so re-runs the
   * selection effect, which reads its properties from the model at its index.
   * A pick something has since replaced (the assistant's selection funnel,
   * say) is dropped, and the selection that replaced it is re-run instead:
   * the selection effect held its properties back for the index too. An
   * element the tree doesn't have keeps its bare-id selection, re-run only
   * for its properties.
   */
  function resolvePendingPreviewPick() {
    const pending = pendingPreviewPickRef.current
    pendingPreviewPickRef.current = null
    if (pending === null) {
      return
    }
    // A durable-batch row (selectFromStreamingPick) or a preview's element id.
    const isRow = typeof pending === 'object'
    const expressId = isRow ? pending.parentExpressId : pending
    const anchors = useStore.getState().selectedAnchorIds ?? []
    if (anchors.length !== 1 || Number(anchors[0]) !== expressId) {
      reapplySelectionToGeometry()
      return
    }
    if (isRow) {
      selectFromInstancePickRow(pending, false)
    } else if (elementsById[expressId] !== undefined) {
      elementSelection(viewer, elementsById, selectItemsInScene, false, expressId)
    } else {
      selectItemsInScene([expressId], false)
    }
  }


  /**
   * Note whether the user drives the camera while a model loads, for the
   * end-of-load fit (loadModel). camera-controls sends `controlstart` for a
   * drag and only `control` for a wheel zoom, and our camera UIs send
   * USER_CAMERA_EVENT (renderDemand.js#noteUserCamera); all are the user.
   *
   * @return {Function} stops watching
   */
  function watchCameraTakenDuringLoad() {
    isCameraTakenDuringLoadRef.current = false
    const controls = viewer?.context?.getCameraControls?.()
    if (typeof controls?.addEventListener !== 'function') {
      return () => undefined
    }
    const onTake = () => {
      isCameraTakenDuringLoadRef.current = true
    }
    controls.addEventListener('controlstart', onTake)
    controls.addEventListener('control', onTake)
    controls.addEventListener(USER_CAMERA_EVENT, onTake)
    return () => {
      controls.removeEventListener?.('controlstart', onTake)
      controls.removeEventListener?.('control', onTake)
      controls.removeEventListener?.(USER_CAMERA_EVENT, onTake)
    }
  }


  /**
   * Handle double click event on canvas.
   *
   * @param {Event} event - The double click event
   */
  function canvasDoubleClickHandler(event) {
    try {
      if (!event.target || event.target.tagName !== 'CANVAS') {
        return
      }

      const picker = new Picker(viewer.context)
      // open-205 #2043: while a Conway load streams in, the scene's pickable
      // geometry is its preview, whose meshes say which element they are. The
      // durable batches streaming beside it carry no pick tables until the
      // load's end (incrementalBatchedBuilder#finalize), so they are not
      // raycast: a pick in a spot only they cover selects nothing yet.
      //
      // Beside it, the durable batches themselves, which are pickable from the
      // row they are written (viewer/streamingBatchPick.js): the builder keeps
      // the very tables finalize stamps. The nearest hit on either wins; where
      // they overlap (IFC: the preview and the durable instance of one element)
      // both name the same element.
      const scene = viewer.context.getScene()
      const loadTargets = [...loadPreviewGroups(scene), ...streamingBatchRoots(scene)]
      if (loadTargets.length > 0) {
        // The loop may be painting on demand (three/renderDemand.js), which
        // leaves a mesh added since the last paint without its world matrix.
        loadTargets.forEach((target) => target.updateMatrixWorld(true))
        for (const hit of picker.castRay(loadTargets)) {
          // A STEP preview mesh knows its occurrence: the same funnel as a
          // durable row, with no instance yet.
          const occurrencePick = previewOccurrencePickOf(hit)
          if (occurrencePick !== null) {
            selectFromStreamingPick(occurrencePick, event.shiftKey)
            return
          }
          const previewId = pickPreviewExpressId([hit])
          if (previewId !== null) {
            selectFromPreviewPick(previewId, event.shiftKey)
            return
          }
          const streamingPick = streamingPickOf(hit)
          if (streamingPick !== null) {
            if (viewer.isolator.canBePickedInScene(streamingPick.parentExpressId)) {
              selectFromStreamingPick(streamingPick, event.shiftKey)
            }
            return
          }
          // An AABB imposter or a fallback mesh: stands in front of nothing
          // the user can select, so look past it.
        }
        return
      }
      const pickedAll = picker.castRay(viewer.context.getScene().children)
      if (pickedAll.length === 0) {
        return
      }
      const picked = pickedAll[0]
      const mesh = picked.object
      // TODO(pablo): obsolete? needed this in h3 at some point.
      // Two pick targets must NOT reach the OutlineEffect:
      // - A BatchedMesh: three auto-enables `USE_BATCHING` for it, but
      //   postprocessing's outline ShaderMaterial (DepthComparisonMaterial)
      //   predates BatchedMesh and omits the batching shader chunks, so its
      //   program fails to compile (`batchingMatrix` undeclared) and blanks
      //   the frame. The batched path highlights by recoloring instances
      //   (batchedHighlight) instead, so clear the outline rather than feed
      //   it the batch.
      // - A geometry-less non-Mesh (Spark SplatMesh, #1726): the
      //   OutlineEffect's per-frame update toggles its selection's
      //   `.visible` off around an extra depth-pass scene render; the
      //   scene-level SparkRenderer re-gathers splats during that pass and
      //   sees the mesh hidden, so its async sort alternates between the
      //   full and the empty splat set — the whole model flickers at the
      //   sort cadence. An outline of a gaussian cloud carries no signal
      //   anyway; store/NavTree selection below still applies.
      const outlineable = !mesh.isBatchedMesh && mesh.isMesh === true
      viewer.setHighlighted(outlineable ? [mesh] : null)
      // Per-instance picking path (Conway-direct):
      //   no-shift = just this PlacedGeometry (a STEP pick: its occurrence)
      //   shift    = add it to (or drop it from) the selection, as a
      //              shift-click does in the NavTree and on every other
      //              model. Shift used to mean "the whole IFC element",
      //              which left IFC and STEP the only models without
      //              multi-select from the scene.
      // BatchedMesh render path (`?feature=batchedMesh` / demandGeometry):
      // the raycast sets `batchId` (the per-instance id); resolve it to the
      // parent IFC product, its global occurrence id (the batched "instance
      // id" `setInstanceSelection` narrows the recolor with), and its STEP
      // occurrence path / solid geometry id through the per-batch tables
      // `assembleBatchedModel` attached — the same per-instance pick the
      // merged path resolves through `mesh.instanceMap`.
      if (mesh.isBatchedMesh && mesh.instanceParents) {
        const batchId = picked.batchId
        if (batchId === undefined || batchId < 0) {
          return
        }
        const parentExpressId = mesh.instanceParents[batchId]
        if (parentExpressId === undefined || !viewer.isolator.canBePickedInScene(parentExpressId)) {
          return
        }
        const instanceId = mesh.instanceOccurrenceIds?.[batchId]
        if (instanceId === undefined) {
          // Undecorated batch (no occurrence table): parent-level only.
          selectItemsInScene([parentExpressId], true, [])
          return
        }
        selectFromInstancePick({
          parentExpressId,
          instanceId,
          rawOccurrencePath: mesh.instanceOccurrencePaths?.[batchId] ?? null,
          isRootLevel: mesh.instanceOccurrencePaths?.[batchId]?.length === 0,
          pickedGeometryId: mesh.instanceGeometryIds?.[batchId] ?? null,
          isShiftKeyDown: event.shiftKey,
        })
        return
      }
      if (mesh.instanceMap) {
        const faceIdx = picked.faceIndex
        const instanceId = mesh.instanceMap.getInstanceIdByTriangle(faceIdx)
        if (instanceId === null) {
          return
        }
        const parentExpressId = mesh.instanceMap.getParentExpressIdByInstance(instanceId)
        if (parentExpressId === null) {
          return
        }
        if (!viewer.isolator.canBePickedInScene(parentExpressId)) {
          return
        }
        selectFromInstancePick({
          parentExpressId,
          instanceId,
          rawOccurrencePath: mesh.instanceMap.getOccurrencePathByInstance?.(instanceId) ?? null,
          isRootLevel: mesh.instanceMap.hasEmptyOccurrencePath?.(instanceId) ?? false,
          pickedGeometryId: mesh.instanceMap.getGeometryExpressIdByInstance?.(instanceId) ?? null,
          isShiftKeyDown: event.shiftKey,
        })
        return
      }
      // Non-instance branch: elementSelection funnels through
      // selectItemsInScene, which resets selectedInstanceIds, so a
      // Conway pick followed by a click on a non-Conway mesh no longer
      // leaves the old single-instance subset stuck on the OutlineEffect.
      if (mesh.expressID !== undefined) {
        elementSelection(viewer, elementsById, selectItemsInScene, event.shiftKey, mesh.expressID)
      } else {
        const geom = mesh.geometry
        if (!areDefinedAndNotNull(geom, geom.index)) {
          // throw new Error('Geometry does not have index information.')
          return
        }
        const geoIndex = geom.index.array
        const IdAttrName = 'expressID'
        const eid = geom.attributes[IdAttrName].getX(geoIndex[3 * picked.faceIndex])
        elementSelection(viewer, elementsById, selectItemsInScene, event.shiftKey, eid)
      }
    } catch (e) {
      console.error(e)
    }
  }


  /**
   * Shared tail of the per-instance scene-pick funnel — used by both the
   * merged (`mesh.instanceMap`) and batched (per-batch tables) double-click
   * branches so the two can't drift on the selection contract.
   *
   * Routes through selectItemsInScene (the single selection funnel) so a
   * scene pick gets the same treatment as every other source: store update
   * + element-path permalink in the URL. The parent expressID is always the
   * "selection" so the properties panel / nav tree / search respond
   * normally; `instanceIds` only narrows what the scene highlight draws.
   * No-shift = just this PlacedGeometry; shift = toggle the picked row in a
   * multi-selection (`elementSelection`).
   *
   * STEP: the picked instance's occurrence path makes the NavTree highlight
   * the one occurrence, not every reuse of the part type (null on shift and
   * for IFC / single-occurrence parts). The geometry path can be deeper
   * than any tree node's — Conway appends a segment per child
   * shape_representation level, and an SRR-attached brep (Alibre exports)
   * adds a non-NAUO id below the leaf — so trim to the deepest tree-known
   * prefix or the NavTree's exact-key matches (row highlight, scroll) find
   * nothing. The store is read imperatively: the click handler is installed
   * once from `onModel`, before that render's `rootElement` is set.
   *
   * Ephemeral solid resolution: when the tree surfaces the picked body as a
   * `type:'solid'` node — since conway#628 the trimmed path lands on it
   * directly (a body's path ends with its own express id), before that as a
   * child of the node at this path — select THAT node, so the NavTree
   * highlights the one body, not the whole part. `resolvePickedOccurrenceNode`
   * owns those cases; it falls back to the part-level selection when the tree
   * has no matching solid (single-solid parts, suppressed anonymous dumps).
   *
   * @param {object} pick
   * @param {number} pick.parentExpressId the geometry-owner product id
   * @param {number} pick.instanceId synthetic per-instance id (IfcInstanceMap
   *   id on the merged path; global occurrence id on the batched path)
   * @param {Array<number>|null} pick.rawOccurrencePath untrimmed STEP path
   * @param {boolean} pick.isRootLevel the instance carries an occurrence path
   *   and it is EMPTY (the root product's own geometry), as opposed to no
   *   occurrence data at all (IFC, undecorated model)
   * @param {number|null} pick.pickedGeometryId the instance's own geometry
   *   (solid) express id
   * @param {boolean} pick.isShiftKeyDown
   */
  function selectFromInstancePick({
    parentExpressId, instanceId, rawOccurrencePath, isRootLevel, pickedGeometryId, isShiftKeyDown,
  }) {
    const rootEltForPick = useStore.getState().rootElement
    const occurrencePath = rawOccurrencePath ?
      trimToTreeOccurrencePath(rawOccurrencePath, occurrencePathKeySetForTree(rootEltForPick)) :
      null
    const {targetId, solidExpressId, transientGeometryId} = resolvePickedOccurrenceNode({
      rootNode: rootEltForPick,
      occurrencePath,
      pickedGeometryId,
      parentExpressId,
      instanceCountAtPath: (path) => occurrenceInstanceIds(path, false).length,
    })
    // A root-level STEP placement (empty occurrence path) has no path to
    // highlight a row by, and its owner id is the product_definition_shape
    // where the row is the product_definition, so the NavTree matched nothing
    // (#1909). The (empty path, owner) join names the top-level product that
    // owns it — the one part of a multi-root file whose owner list holds the
    // pick's owner (#1901) — and falls back to the sole root of a one-product
    // file (`findRootLevelOwnerNode`). Hand that row to the funnel as the
    // anchor: the row highlight, Properties, crumb and permalink follow
    // anchors, while the scene keeps selecting by the owner id (hide, the
    // per-instance narrowing). A multi-root tree without owner lists stays as
    // it was, unless a placement reports a part's own product_definition as
    // its owner (direct SDR), which names that part whatever lists the tree
    // carries. Resolved before the shift branch, which needs it too.
    const rootRow = (isRootLevel && occurrencePath === null) ?
      findRootLevelOwnerNode(rootEltForPick, parentExpressId) : null
    // A STEP preview mesh carries no instance. At the root, where no path
    // tells its shell from the product's others, its owner and geometry name
    // the durable instance it previews, once that has streamed in; so the
    // pick narrows to the shell clicked, as a durable pick does (#1909),
    // instead of reading as a click on the product's row.
    const hasInstance = (id) => id !== null && id !== undefined
    const pickedInstanceId = (!hasInstance(instanceId) && rootRow && pickedGeometryId !== null) ?
      rootLevelInstanceOf(parentExpressId, pickedGeometryId) : instanceId
    if (isShiftKeyDown && rootRow && hasInstance(pickedInstanceId)) {
      toggleRootLevelInstance(rootRow, targetId, pickedInstanceId)
      return
    }
    if (isShiftKeyDown) {
      // Multi-select: toggle the picked row's id, exactly as a shift-click on
      // that NavTree row does. `selectItemsInScene` resolves a STEP
      // multi-selection's rows back to their instances for the highlight.
      // An anonymous piece has no row to add, so it doesn't join.
      // A STEP part-level pick's target is its geometry's product id, which is
      // no row; the row is the occurrence's own node. A root-level pick with
      // no instance to toggle (a preview whose shell hasn't streamed in)
      // toggles the product's row, which its owner id is not (#1909).
      const rowId = rootRow ? rootRow.expressID :
        (occurrencePath && occurrencePath.length > 0) ?
          (solidExpressId ?? occurrencePath[occurrencePath.length - 1]) : targetId
      if (transientGeometryId === null) {
        elementSelection(viewer, elementsById, selectItemsInScene, true, rowId)
      }
      return
    }
    if (transientGeometryId !== null) {
      materializeTransientNode(occurrencePath, transientGeometryId)
    }
    selectItemsInScene(
      [targetId], true, hasInstance(pickedInstanceId) ? [pickedInstanceId] : [],
      occurrencePath, solidExpressId, rootRow ? [rootRow.expressID] : null)
    // The instance a ray hit is the selection's exact narrowing: it keeps to
    // that instance while siblings stream in, and through the end-of-load
    // repaint (reapplySelectionToGeometry), as a pick on the finished model.
    useStore.getState().setSelectedInstancesExact(hasInstance(pickedInstanceId))
    // The shell a root-level pick hit, for the load-time paint (NavTreeSlice
    // #selectedRootGeometryId).
    useStore.getState().setSelectedRootGeometryId(rootRow ? pickedGeometryId : null)
  }


  /**
   * Shift-pick of a root-level STEP shell in a one-product file (#1909): add
   * the clicked instance to the scene selection, or drop it if it is already
   * in. The toggled unit is the INSTANCE. The row every such shell shares is
   * the product's, so toggling it (what `elementSelection` does for any other
   * row) would drop the product on the second shell, and the shell's owner id
   * is no row at all, so the pick did nothing.
   *
   * The root row stays an anchor while any root-level instance is selected, and
   * leaves with the last. Other rows already selected keep their anchors and
   * instances; `selectedElements` only ever gains the owner ids, since the
   * instance narrowing, not the owners, decides what is lit.
   *
   * @param {object} rootRow the top-level product's row: the tree's root, or
   *   in a multi-root file the part that owns the shell
   * @param {number} ownerId the shell's owner (`product_definition_shape`)
   * @param {number} instanceId the clicked instance
   */
  function toggleRootLevelInstance(rootRow, ownerId, instanceId) {
    const state = useStore.getState()
    // Only this product's own shells: in a multi-root file the other parts'
    // root-level shells are theirs, and must neither keep this row anchored
    // nor leave with it.
    const rootLevel = rootLevelInstancesOfProduct(state.rootElement, rootRow, rootLevelInstances())
    const path = state.selectedOccurrencePath
    const occurrenceRow = (Array.isArray(path) && path.length > 0) ?
      (state.selectedSolidExpressId ?? path[path.length - 1]) : null
    const next = toggleRootLevelInstanceSelection({
      occurrenceRow,
      selection: {
        elements: state.selectedElements,
        anchors: state.selectedAnchorIds,
        instances: state.selectedInstanceIds,
      },
      rootId: rootRow.expressID,
      ownerId,
      instanceId,
      rootInstanceIds: rootLevel.instanceIds,
      rootOwnerIds: rootLevel.ownerIds,
    })
    selectItemsInScene(next.elements, false, next.instances, null, null, next.anchors)
    useStore.getState().setSelectedInstancesExact(next.instances.length > 0)
  }


  /**
   * Index the model starting at the given rootElt, clearing any
   * previous index data and parses any incoming search params in the
   * URL.  Enables search bar when done.
   *
   * @param {object} m The ShareViewer instance.
   * @param {object} rootElt Root ifc element for recursive indexing.
   */
  function initSearch(m, rootElt) {
    searchIndex.clearIndex()
    debug().log('CadView#initSearch: ', m, rootElt)
    debug().time('build searchIndex')
    searchIndex.indexElement({properties: m}, rootElt)
    debug().timeEnd('build searchIndex')
    onSearchParams()
  }


  /**
   * Search for the query in the index and select matching items in UI elts.
   */
  function onSearchParams() {
    const sp = new URLSearchParams(window.location.search)
    let query = sp.get('q')
    if (query) {
      query = query.trim()
      if (query === '') {
        throw new Error('IllegalState: empty search query')
      }
      const resultIDs = searchIndex.search(query)
      selectItemsInScene(resultIDs, false)
      setDefaultExpandedElements(resultIDs.map((id) => `${id}`))
      const types = elementTypesMap
        .filter((t) => t.elements.filter((e) => resultIDs.includes(e.expressID)).length > 0)
        .map((t) => t.name)
      if (types.length > 0) {
        setDefaultExpandedTypes(types)
      }
      gtagEvent('search', {
        search_term: query,
      })
    } else {
      resetSelection()
    }
  }


  /** Clear current selection. */
  function resetSelection() {
    if (selectedElements?.length !== 0) {
      selectItemsInScene([])
    }
  }


  /** Reset global state */
  function resetState() {
    // TODO(pablo): use or remove level code
    setLevelInstance(null)

    resetSelection()
    // Scene and store only. This call once passed `location` first, which
    // landed in the viewer slot, so its guard failed and nothing reset: after
    // Clear (deselectItems, which deletes the planes itself) the store still
    // reported the planes and the menu showed them checked (open-205, #2014).
    // The `cp:` hash term is left alone: on a model or view-settings change it
    // already belongs to the destination, and Clear's navigation drops it.
    resetCutPlaneState(viewer, setCutPlaneDirections, setIsCutPlaneActive)
    setIsSearchBarVisible(false)
    setIsNavTreeVisible(false)
    setIsPropertiesVisible(false)
    setIsNotesVisible(false)
  }


  /** Deselect active scene elts and remove clip planes. */
  function deselectItems() {
    if (viewer) {
      viewer.clipper.deleteAllPlanes()
    }
    resetState()
    let repoFilePath = modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath
    disablePageReloadApprovalCheck()
    // TODO(pablo): repoFilePath is getting prefixed with a slash, need to remove it
    if (repoFilePath.startsWith('/')) {
      repoFilePath = repoFilePath.substring(1)
    }
    navWith(navigate, `${pathPrefix}/${repoFilePath}`, {search: '', hash: ''})
  }


  /**
   * Pick the given items in the scene. This is the single funnel for
   * EVERY selection source — scene pick, NavTree click, search,
   * keyboard, and URL/permalink — so it owns the full store-side
   * selection contract: the parent-level `selectedElements`, the
   * Conway-direct per-instance `selectedInstanceIds`, and (optionally)
   * the element-path permalink in the URL. Routing every source
   * through here is what keeps the scene and NavTree in sync in both
   * directions.
   *
   * @param {Array} resultIDs Array of expressIDs
   * @param {boolean} updateNavigation Whether to update navigation
   * @param {Array<number>} instanceIds Conway-direct per-instance highlight
   *   restriction. Empty (the default) clears any prior per-instance
   *   highlight — required so a selection arriving from a non-scene
   *   source (NavTree, search, permalink) doesn't inherit the instance
   *   subset left behind by an earlier scene pick. Only the Conway
   *   scene-pick path passes a non-empty value.
   * @param {Array<number>} occurrencePath STEP occurrence path (NAUO express
   *   ids) of the selected occurrence, or null. Disambiguates which NavTree
   *   node highlights when a reused part's occurrences share one expressID;
   *   null (the default) clears it for IFC and non-occurrence sources.
   * @param {number} solidExpressId Express id of the selected ephemeral solid
   *   (a multibody STEP part's named body), or null when the selection is a
   *   whole product/occurrence. Since conway#628 it is also the last segment
   *   of `occurrencePath` for a body with a tree node; carried separately
   *   because it's what tells "the part" from "one piece inside it" wherever
   *   the two share a path — an anonymous piece (conway#387) has no node and
   *   no segment of its own — and because NavTree row highlight, per-solid
   *   hide and the permalink all read it.
   * @param {Array} anchorIds The ids the user actually picked, when the
   *   caller expanded them into descendants for the scene highlight
   *   (`elementSelection` does). Null (the default) means every result is
   *   its own anchor. NavTree row highlight, Properties and the TopBar
   *   crumb follow the anchors; only the scene uses the expanded set.
   * @param {boolean} keepRootNarrowing a shift-click: when the instances are
   *   resolved from the anchors, keep the root-level instances already
   *   selected rather than widen them to the whole product.
   */
  function selectItemsInScene(
    resultIDs, updateNavigation = true, instanceIds = [], occurrencePath = null,
    solidExpressId = null, anchorIds = null, keepRootNarrowing = false) {
    // NOTE: we might want to compare with previous selection to avoid unnecessary updates
    if (!viewer) {
      return
    }
    try {
      // A shift-click that took a top-level product's row out of the
      // selection takes the product's own geometry with it: its owner ids are
      // in the viewer's selected ids, not in the anchors, and would keep its
      // root-level shells lit by id once the row is gone.
      if (keepRootNarrowing) {
        const rootElt = useStore.getState().rootElement
        const held = (useStore.getState().selectedAnchorIds ?? []).map(Number)
        const kept = (anchorIds ?? resultIDs).map(Number)
        for (const id of held.filter((anchor) => !kept.includes(anchor))) {
          const product = findRootLevelProductNode(rootElt, id)
          if (product) {
            const owners = new Set(rootLevelInstancesOfProduct(rootElt, product, rootLevelInstances()).ownerIds.map(Number))
            resultIDs = resultIDs.filter((resultId) => !owners.has(Number(resultId)))
          }
        }
      }
      // STEP, selected by row rather than by pick (a shift-click
      // multi-selection, a search): the rows' ids are NAUOs and solids, which
      // own no geometry, so without instances the scene highlighted nothing.
      // Resolve the rows to their occurrences' instances. Empty for IFC.
      if (instanceIds.length === 0 && occurrencePath === null && resultIDs.length > 0) {
        const occurrences = selectedOccurrences({
          rootNode: useStore.getState().rootElement,
          anchorIds: anchorIds ?? resultIDs,
        })
        if (occurrences.length > 0) {
          instanceIds = [...new Set(occurrences.flatMap(({occurrencePath: path, solidExpressId: solid}) =>
            occurrenceInstanceIds(path, true, solid)))]
        }
        // A top-level product has an empty occurrence path, so the lookup
        // above can't resolve it: its row means every one of its root-level
        // instances (#1909, #1901; `rootLevelSelectionForAnchors` has the rule).
        const rootLevel = rootLevelInstances()
        const root = rootLevelSelectionForAnchors({
          rootNode: useStore.getState().rootElement,
          anchorIds: anchorIds ?? resultIDs,
          rootLevel,
          current: {
            anchors: useStore.getState().selectedAnchorIds,
            instances: useStore.getState().selectedInstanceIds,
          },
          keepNarrowing: keepRootNarrowing,
        })
        if (root) {
          instanceIds = [...new Set([...instanceIds, ...root.instanceIds])]
          resultIDs = [...new Set([...resultIDs, ...root.ownerIds])]
        }
      }
      // Update The Component state
      const resIds = resultIDs.map((id) => `${id}`)
      setSelectedElements(resIds)
      // Callers that expand a pick into descendants (elementSelection)
      // pass the clicked ids explicitly; for everyone else every result
      // is its own anchor.
      setSelectedAnchorIds(anchorIds === null ? resIds : anchorIds.map((id) => `${id}`))
      setSelectedInstanceIds(instanceIds)
      // Derived, unless the pick funnel says otherwise once this returns.
      useStore.getState().setSelectedInstancesExact(false)
      useStore.getState().setSelectedRootGeometryId(null)
      // STEP per-occurrence key: a reused part's occurrences share one
      // expressID, so this disambiguates which NavTree node to highlight.
      // Every non-occurrence caller passes null, clearing any stale path.
      setSelectedOccurrencePath(occurrencePath)
      setSelectedSolidExpressId(solidExpressId)
      // Sets the url to the first selected element path.
      if (resultIDs.length > 0 && updateNavigation) {
        // The row the selection is anchored on, when the caller named one:
        // a scene pick's result id can be the geometry's owner, which is no
        // row, while its anchor is (a root-level STEP pick, #1909).
        const firstId = anchorIds !== null && anchorIds.length > 0 ?
          anchorIds.slice(0, 1) : resultIDs.slice(0, 1)
        // STEP: build the element path from the occurrence path, prepending
        // the root id (occurrence paths omit the root). The elementsById
        // lookup can't do it: a reused sub-assembly's duplicated subtrees
        // share expressIDs, so the table holds only the last-visited
        // duplicate and the permalink could encode a different occurrence
        // than the one selected. For a scene pick it misses entirely —
        // `firstId` is then the geometry-owner product_definition_shape id,
        // which is not a tree node. Store read is imperative because this
        // funnel is also called from the once-installed dblclick handler,
        // whose closure predates the render that set `rootElement`.
        //
        // Only tree-known paths are written: `trimToTreeOccurrencePath`
        // passes a RAW geometry path through unchanged when the tree carries
        // no occurrence keys (engine skew between geometry stamping and
        // getSpatialStructure, malformed capture), and minting that into the
        // URL would both share a dead link and — via the location effect
        // re-entering selectElementBasedOnFilepath one tick later — clobber
        // the pick's per-instance highlight. Non-tree paths fall back to the
        // legacy lookup, which fails into this try/catch for a scene pick's
        // PDS id, so no navigation happens (the pre-occurrence behavior).
        const rootElt = useStore.getState().rootElement
        const isTreeOccurrencePath = Boolean(
          occurrencePath && occurrencePath.length > 0 && rootElt &&
          occurrencePathKeySetForTree(rootElt)?.has(occurrencePathKey(occurrencePath)))
        // A selected solid appends its own express id below the occurrence
        // path when the path doesn't already carry it — see
        // `occurrenceElementPathIds`, whose inverse
        // `selectElementBasedOnFilepath` applies on load.
        const pathIds = isTreeOccurrencePath ?
          occurrenceElementPathIds(rootElt.expressID, occurrencePath, solidExpressId) :
          getParentPathIdsForElement(elementsById, parseInt(firstId))
        const repoFilePath = modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath
        const enabledFeatures = searchParams.get('feature')
        const elementPath = pathIds.join('/')
        let path = partsToPath(pathPrefix, repoFilePath, elementPath)
        if (enabledFeatures) {
          path += `?feature=${enabledFeatures}`
        }
        navWith(
          navigate,
          path,
          {
            search: '',
            hash: window.location.hash,
          })
      }
    } catch (e) {
      // IFCjs will throw a big stack trace if there is not a visual
      // element, e.g. for IfcSite, but we still want to proceed to
      // setup its properties.
      debug().log('TODO: no visual element for item ids: ', resultIDs)
    }
  }


  /**
   * Extracts the path to the element from the url and selects the element
   *
   * @param {string} filepath Part of the URL that is the file path, e.g. index.ifc/1/2/3/...
   * @param {boolean} [force] select it even if it's already among the selected
   */
  function selectElementBasedOnFilepath(filepath, force = false) {
    // Normalize to the element path BELOW the model file. The two callers
    // pass different shapes: the location watcher passes the already-split
    // element path ('/120010/.../2867' — no file suffix, split is a no-op),
    // while the post-load call passes the full source path (gitpath / srcUrl /
    // installPrefix+filepath) whose last '/'-segment is the model FILENAME.
    // Without this split, a filename with a digit prefix — an OPFS upload's
    // hex UUID (~62% start with a digit) or a numeric-named file like
    // 171210AISC_Sculpture_param.ifc — parseInt()s to a finite "element id"
    // and CLOBBERS the selection the permalink restore just made (#1639
    // follow-up: NavTree kept its highlight, the scene lost its own).
    const suffixSplit = filepath.split(fileSuffixBoundaryRegex)
    if (suffixSplit.length === 2) {
      filepath = suffixSplit[1]
    }
    if (filepath.startsWith('/')) {
      filepath = filepath.substring(1)
    }
    const parts = filepath.split(/\//)
    // A root-only path (`part.step/7`) is what a pick of a one-product STEP
    // part's own geometry writes (#1909); the multi-segment branch below
    // can't read it, having no occurrence path to resolve. Restore it as the
    // pick selects: the root row as the anchor, the scene on the root's
    // instances.
    // A part that claims no root-level instance is not resolved here (null),
    // so its `wrapper/part` link falls through to the branch below, as it did
    // before the multi-root parts were named (#1901).
    const rootOnly = resolveRootOnlyElementPath(useStore.getState().rootElement, parts, rootLevelInstances)
    if (rootOnly) {
      selectRootOnlyElement(rootOnly, force)
      return
    }
    if (parts.length > 1) {
      debug().log('CadView#selectElementBasedOnUrlPath: have path', parts)
      // Whole-segment numeric only: app-written element paths are pure ids,
      // and parseInt's prefix parsing would accept junk like '12abc'.
      const lastPart = parts[parts.length - 1]
      const targetId = /^\d+$/.test(lastPart) ? parseInt(lastPart, 10) : NaN
      if (!isFinite(targetId)) {
        return
      }
      const state = useStore.getState()
      // STEP: the element path's ids below the root ARE the selection's
      // occurrence path (selectItemsInScene writes the URL from
      // `selectedOccurrencePath`), so resolve it back rather than selecting
      // the bare trailing id — that id is a NAUO shared by every duplicate of
      // a reused sub-assembly (under-determined in the tree) and never equals
      // the product_definition_shape id that owns the geometry (unreachable
      // in the scene). See design/new/step-occurrence-selection.md.
      // `resolveElementPathOccurrence` is the single tree-membership gate (a
      // non-null occurrence path ⟺ the tree knows these ids) and its node
      // supplies `hasChildren` for the scene resolution below. Null for IFC
      // (nodes carry no occurrence paths) and for element paths the tree
      // doesn't know — those keep the plain scalar-id selection.
      //
      // The first segment must be the root id: every app-written element
      // path starts at the root (both the occurrence branch and
      // getParentPathIdsForElement), so a hand-trimmed URL whose tail
      // happens to also be a valid occurrence key must not silently
      // re-anchor to that different occurrence — it degrades to the
      // scalar-id selection instead.
      const eltPathIds = parts.slice(1).map((part) => parseInt(part))
      const startsAtRoot =
        state.rootElement && parseInt(parts[0]) === state.rootElement.expressID
      const {node, occurrencePath, solidExpressId, transientGeometryId} = startsAtRoot ?
        resolveElementPathOccurrence({
          rootNode: state.rootElement,
          eltPathIds,
          hasGeometryAtPath: (path, geometryExpressId) =>
            occurrenceInstanceIds(path, false, geometryExpressId).length > 0,
        }) :
        {node: null, occurrencePath: null, solidExpressId: null, transientGeometryId: null}
      if (transientGeometryId !== null) {
        materializeTransientNode(occurrencePath, transientGeometryId)
      }
      // Skip re-selecting when this element is already the active
      // selection. We consult the store (selectItemsInScene updates it
      // synchronously) and not only viewer.getSelectedIds(), because this
      // also runs from the location-watch effect — which fires on the
      // SELF-INDUCED navigation a selection just made, and runs BEFORE
      // the selection effect has pushed the pick into the viewer, so
      // getSelectedIds() is still stale. Without the store check the
      // re-selection would funnel through selectItemsInScene again and
      // reset selectedInstanceIds, widening a Conway per-instance scene
      // pick to the whole element. When BOTH sides carry an occurrence
      // path, identity is the path, not the trailing id — duplicates share
      // the id, and a scene pick's selectedElements holds the PDS id, not
      // this NAUO, though its selection is the same occurrence. When the
      // store side has none (a shift multi-select or types-tree group
      // reset it to null while the pathname kept the occurrence), fall
      // back to id membership — otherwise any hash-only location change
      // (camera rest, panel close) would re-fire this and stomp the
      // accumulated multi-select back to the URL's single occurrence.
      const idSelected =
        state.selectedElements.includes(`${targetId}`) ||
        viewer.getSelectedIds().includes(targetId)
      // Occurrence identity is the path — plus the solid id when the URL
      // addresses one piece of a multibody part. For a piece that shares its
      // part's path (an anonymous conway#387 piece, a pre-conway#628 solid)
      // path equality alone would treat "the part" and "one piece inside it"
      // as the same selection and skip the re-select.
      const alreadySelected = (occurrencePath && state.selectedOccurrencePath) ?
        (occurrencePathsEqual(occurrencePath, state.selectedOccurrencePath) &&
          state.selectedSolidExpressId === solidExpressId) :
        idSelected
      if (alreadySelected && !force) {
        return
      }
      // Mirror the NavTree occurrence-click funnel: resolve the path to the
      // exact instance ids so the scene highlights just this occurrence
      // (`includeDescendants` per the node's children — an assembly needs
      // the descendant scan, a leaf takes the exact-key path; a solid narrows
      // further by its geometry express id). Empty for the scalar-id
      // (IFC / unknown-path) case, where occurrencePath is null.
      const hasChildren = Boolean(node && Array.isArray(node.children) && node.children.length > 0)
      const instanceIds = occurrencePath ?
        occurrenceInstanceIds(
          occurrencePath, solidExpressId !== null ? false : hasChildren, solidExpressId) : []
      selectItemsInScene([targetId], false, instanceIds, occurrencePath, solidExpressId)
    }
  }


  /**
   * Select a top-level product from a root-only permalink, as a click on its
   * row does: the row is the anchor and the scene is on ALL its root-level
   * instances (a link can't say which shell was clicked; see
   * `rootLevelSelectionForAnchors`). Does nothing when the product has no
   * root-level geometry to select, which is how such a link behaved before.
   *
   * @param {object} rootRow the product's row: the tree's root, or one part
   *   of a multi-root file (`resolveRootOnlyElementPath`)
   * @param {boolean} force select it even if it's already the anchor
   */
  function selectRootOnlyElement(rootRow, force) {
    const rootLevel = rootLevelInstancesOfProduct(useStore.getState().rootElement, rootRow, rootLevelInstances())
    if (rootLevel.instanceIds.length === 0) {
      return
    }
    // The pick that wrote this URL has already selected it, narrowed to the
    // shell(s) clicked; re-selecting would widen that to every root-level
    // instance. Only a root-level instance in the selection proves that: a
    // row click on the root (anchor and URL, but no instances) comes through
    // here too, and still needs its geometry. So does the shell a root-level
    // pick named before its instance had streamed in (a STEP preview pick:
    // NavTreeSlice#selectedRootGeometryId, which a row click clears); the
    // end-of-load repaint narrows that to the shell (#2089).
    const held = useStore.getState()
    const anchors = held.selectedAnchorIds ?? []
    const isSelectedAlready = anchors.length === 1 && anchors[0] === `${rootRow.expressID}` &&
      ((held.selectedInstanceIds ?? []).some((id) => rootLevel.instanceIds.includes(id)) ||
        (held.selectedRootGeometryId ?? null) !== null)
    if (!force && isSelectedAlready) {
      return
    }
    // Resolved from the anchor, as for a click on the row: the whole product.
    selectItemsInScene([rootRow.expressID], false, [], null, null, [rootRow.expressID])
  }


  /**
   * The root-level instance with this owner and geometry: the durable
   * instance a root-level STEP preview mesh draws, which the mesh itself
   * can't name (its payload has no instance id).
   *
   * @param {number} ownerExpressId the preview mesh's owner (`expressID`)
   * @param {number} geometryExpressId its geometry (`geometryExpressID`)
   * @return {number|null} the instance id, or null until one has streamed in
   */
  function rootLevelInstanceOf(ownerExpressId, geometryExpressId) {
    return rootLevelShellInstances([ownerExpressId], geometryExpressId)[0] ?? null
  }


  /**
   * The root-level instances of `geometryExpressId` owned by any of
   * `ownerIds`: the shell a root-level pick hit, wherever it is placed at the
   * root.
   *
   * @param {Array<number|string>} ownerIds candidate owners (the selected ids)
   * @param {number} geometryExpressId the shell's geometry
   * @return {Array<number>} instance ids, empty until one has streamed in
   */
  function rootLevelShellInstances(ownerIds, geometryExpressId) {
    const owners = new Set(ownerIds.map(Number))
    const {instanceIds, instanceOwners, instanceGeometryIds = []} = rootLevelInstances()
    return instanceIds.filter((id, i) =>
      owners.has(Number(instanceOwners[i])) &&
      instanceGeometryIds[i] !== null && instanceGeometryIds[i] !== undefined &&
      Number(instanceGeometryIds[i]) === Number(geometryExpressId))
  }


  /**
   * The model's root-level instances (an empty path), the ids that own them
   * (per instance in `instanceOwners`) and their geometry ids
   * (`instanceGeometryIds`), and the instances of every occurrence below the
   * sole root, or below a given part of a multi-root file
   * (`descendantInstanceIdsOf`); empty where the viewer can't say.
   *
   * @return {{instanceIds: Array<number>, parentExpressIds: Array<number>,
   *   instanceOwners: Array<number>, instanceGeometryIds: Array<number|null>,
   *   descendantInstanceIds: Array<number>, descendantInstanceIdsOf: Function}}
   */
  function rootLevelInstances() {
    const descendantsOf = (product) => [...new Set((product?.children ?? []).flatMap((child) =>
      (Array.isArray(child.occurrencePath) && child.occurrencePath.length > 0) ?
        occurrenceInstanceIds(child.occurrencePath, true, child.ephemeral === true ? child.expressID : null) :
        []))]
    if (typeof viewer?.getRootLevelInstances !== 'function') {
      return {
        instanceIds: [], parentExpressIds: [], instanceOwners: [], instanceGeometryIds: [],
        descendantInstanceIds: [], descendantInstanceIdsOf: () => [],
      }
    }
    const rootLevel = viewer.getRootLevelInstances(0)
    // The whole product is the root's own geometry and every occurrence below
    // it. Only worth resolving when the root has geometry of its own.
    const root = findSoleRootNode(useStore.getState().rootElement)
    const descendantInstanceIds = (root && rootLevel.instanceIds.length > 0) ? descendantsOf(root) : []
    return {...rootLevel, descendantInstanceIds, descendantInstanceIdsOf: descendantsOf}
  }


  /**
   * Resolve a STEP occurrence path to the exact IfcInstanceMap instance ids
   * to highlight — the single implementation shared by the NavTree click
   * funnel and the permalink resolver, so the two entry points can't drift
   * on the resolution contract (modelID, options, the feature-detect for
   * viewers without the method). Empty array when the viewer can't resolve
   * (legacy/IFC viewers) so callers fall back to parent-level selection.
   *
   * @param {Array<number>} occurrencePath NAUO express ids, root→leaf
   * @param {boolean} includeDescendants an assembly needs the descendant
   *   prefix scan; a leaf takes the O(1) exact-key path
   * @param {number} geometryExpressId for an ephemeral solid node, the
   *   solid's own express id — narrows the resolution to the one body of a
   *   multibody part; null keeps every instance at/under the path
   * @return {Array<number>} synthetic instance ids
   */
  function occurrenceInstanceIds(occurrencePath, includeDescendants, geometryExpressId = null) {
    return typeof viewer.getInstanceIdsForOccurrencePath === 'function' ?
      viewer.getInstanceIdsForOccurrencePath(
        0, occurrencePath, {includeDescendants, geometryExpressId}) : []
  }


  /**
   * Materialize a transient NavTree row for an anonymous geometry piece
   * (conway#387): resolve its label from Conway's arbitrary-id lookup
   * ("Face #6321" / "Solid #250", degrading to "Item #id" on older engines)
   * and add it to the session-only transient-node store, where NavTreePanel
   * injects it under its parent part's row. Fire-and-forget: the selection
   * itself never waits on the label, and the store dedups repeat arrivals
   * (pick then permalink of the same piece).
   *
   * @param {Array<number>} occurrencePath the parent part's NAUO path
   * @param {number} geometryExpressId the piece's own express id
   */
  function materializeTransientNode(occurrencePath, geometryExpressId) {
    const pathKey = occurrencePathKey(occurrencePath)
    labelForGeometryId(selectReadModel(useStore.getState()), geometryExpressId).then((label) => {
      useStore.getState().addTransientTreeNodes(
        pathKey, [{expressID: geometryExpressId, label}])
    })
  }


  /**
   * handles updating the stored file meta data for all cases except local files.
   */
  function updateLoadedFileInfo() {
    setLoadedFileInfo({
      source: 'share', info: {
        url: 'Foo',
      },
    })
    /*
    const githubRegex = /(raw.githubusercontent|github.com)/gi
    if (modelUrlStr.indexOf('/') === 0) {
      setLoadedFileInfo({
        source: 'share', info: {
          url: `${window.location.protocol}//${window.location.host}${modelUrlStr}`,
        },
      })
    } else if (githubRegex.test(modelUrlStr)) {
      setLoadedFileInfo({source: 'github', info: {url: modelUrlStr}})
    }
    */
  }


  // Begin useEffect //
  useEffect(() => {
    setAppPrefix(appPrefix)
  }, [appPrefix, setAppPrefix])


  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!isViewerLoaded) {
      debug().log('Auth state changed. isAuthLoading:', isAuthLoading,
        'isAuthenticated:', isAuthenticated, 'isAuthResolved:', isAuthResolved)
      // No auth precondition — onViewerInternal waits (bounded) for auth
      // itself and retries authed on failure. This effect's remaining jobs:
      // kick onViewer once OPFS availability lands (the [viewer]-effect may
      // have fired while it was still null), and re-kick on auth-state
      // changes (deduped by onViewer's in-flight ref).
      if (isOpfsAvailable !== null) {
        (async () => {
          await onViewer()
        })()
      }
    }
  }, [isAuthLoading, isAuthenticated, isAuthResolved, accessToken, isOpfsAvailable])


  // ModelPath changes in parent (ShareRoutes) from user and
  // programmatic navigation (e.g. clicking element links).
  useEffect(() => {
    debug().log('CadView#useEffect1[modelPath], calling onModelPath, modelPath:', modelPath)
    // A different model starts a new open, so its failures count again even
    // when the model in between never touched the dedupe refs (A fails, B
    // loads, A fails). Reruns of the SAME model (customViewSettings) keep
    // them, so one failed open stays one event. Share#1961 codex review.
    const dedupeKey = modelIdentity(modelPath, installPrefix)
    if (dedupeModelKeyRef.current !== dedupeKey) {
      dedupeModelKeyRef.current = dedupeKey
      reportedRefusalRef.current = null
      reportedLoadFailureRef.current = null
      // Only on an identity change: re-runs for the same model (view
      // settings) keep this state, as they keep the dedupe refs above.
      const wasIndexed = useStore.getState().indexedModel !== null
      // A pick on the left load's preview (#2043) is a selection in a model
      // the user has left, whether or not that load had reached its index.
      const wasPickedInPreview = previewPickedRef.current
      forgetLoadedModel()
      if (wasIndexed || wasPickedInPreview) {
        forgetIndexedSelection()
      }
    }
    onModelPath()
  }, [modelPath, customViewSettings])


  // Viewer changes in onModelPath (above)
  useEffect(() => {
    (async () => {
      // onViewer's own in-flight guard dedupes when this races the
      // [auth]-state effect during a mid-load auth resolution.
      await onViewer()
    })()
  }, [viewer])


  // searchParams changes in parent (ShareRoutes) from user and
  // programmatic navigation, and in SearchBar.
  useEffect(() => {
    onSearchParams()
  }, [searchParams])


  useEffect(() => {
    (async () => {
      if (Array.isArray(preselectedElementIds) && preselectedElementIds.length && viewer) {
        await viewer.preselectElementsByIds(0, preselectedElementIds)
      }
    })()
  }, [preselectedElementIds])


  // Watch for path changes within the model.
  // TODO(pablo): would be nice to have more consistent handling of path parsing.
  useEffect(() => {
    if (rootElement) {
      // Boundary-anchored suffix split: the bare `filetypeRegex` also matches
      // type names appearing as directory segments (".../main/step/nist/
      // as1.stp/1/2" splits on the "step" dir → 3 parts), which failed the
      // part-count check below and silently dropped element-path permalinks
      // for any model under such a directory.
      const parts = location.pathname.split(fileSuffixBoundaryRegex)
      const expectedPartCount = 2
      // A `#sel:` token owns the selection (the path names just its first
      // row), so a location carrying one applies it — which is also what makes
      // Back and Forward through multi-selections restore them. Its writer
      // keeps it in step with the selection, so it's a no-op for a change made
      // here.
      if (readSelectionHash(window.location)) {
        selectFromSelectionHash()
      } else if (parts.length === expectedPartCount && parts[1] !== '') {
        // No token, yet several rows selected that would have written one (not
        // a search, and not too many for a link): the location went Back to
        // before the multi-selection, so the path's single element is the
        // selection again. Forced, because that element is still among the
        // selected and would otherwise be skipped.
        const anchors = useStore.getState().selectedAnchorIds ?? []
        const isMultiBack = anchors.length > 1 &&
          !new URLSearchParams(window.location.search).has('q') &&
          selectionFitsLink(anchors, viewer)
        // Otherwise only a new path (or tree) selects. A hash-only change —
        // a panel toggled, a hide, the `#sel:` token dropped as a shift-click
        // emptied the selection — leaves the selection as it is: re-selecting
        // the path's element then brought back one just deselected.
        const isNewPath = lastPathSelectionRef.current?.pathname !== location.pathname ||
          lastPathSelectionRef.current?.rootElement !== rootElement
        if (isNewPath || isMultiBack) {
          selectElementBasedOnFilepath(parts[1], isMultiBack)
        }
      }
      lastPathSelectionRef.current = {pathname: location.pathname, rootElement}
    }
  }, [location, model, rootElement])


  useEffect(() => {
    // Same staleness guard as the Properties panel: this effect awaits
    // the entity fetch before writing `selectedElement`, so a slow
    // earlier selection could otherwise resolve last and leave every
    // consumer (Properties, the TopBar crumb) showing the previous pick.
    let isStale = false
    ;(async () => {
      if (!Array.isArray(selectedElements) || !viewer) {
        return
      }
      // Update The selection on the scene pick/unpick
      const ids = selectedElements.map((id) => parseInt(id))
      await viewer.setSelection(0, ids)
      // While a Conway load runs there is no model for setSelection to
      // paint, only the preview meshes (open-205 #2043) and the durable
      // batches streaming in (streamingBatchPick.js); a no-op otherwise.
      viewer.setPreviewSelection?.(ids, {
        instanceIds: Array.isArray(selectedInstanceIds) ? selectedInstanceIds : [],
        occurrencePath: useStore.getState().selectedOccurrencePath ?? null,
        solidExpressId: useStore.getState().selectedSolidExpressId ?? null,
        instancesExact: useStore.getState().selectedInstancesExact === true,
        rootGeometryId: useStore.getState().selectedRootGeometryId ?? null,
      })
      // Per-instance highlight (Conway-direct): if the click handler
      // tagged us with a specific PlacedGeometry's synthetic ID,
      // restrict the visible highlight to just that instance. The
      // setSelection call above already rendered the full parent
      // element; setInstanceSelection replaces that with a one-
      // instance subset. Empty array = no override (Shift-click or
      // legacy path).
      //
      // `ids.length > 0` guard: setInstanceSelection re-creates the
      // Conway selection subset from scratch, so calling it when the
      // parent selection is empty would re-add a cyan overlay tied
      // to a stale instanceId — the regression spotted during
      // isolator review. The current hide path preserves selection
      // state (for H-toggle semantics) and clears the cyan visual
      // imperatively, so the dep-change path through this effect
      // doesn't normally hit; this guard still backstops any future
      // path that drops `selectedElements` without
      // `selectedInstanceIds`.
      if (ids.length > 0 &&
          Array.isArray(selectedInstanceIds) && selectedInstanceIds.length > 0 &&
          typeof viewer.setInstanceSelection === 'function') {
        viewer.setInstanceSelection(0, selectedInstanceIds)
      }
      // A pick on the preview before the index (#2043): nothing can say what
      // it is yet — the engine is still parsing, there is no tree to expand —
      // so Properties waits, and resolvePendingPreviewPick re-runs this once
      // the tree is up. Keyed on the index, not on selectReadModel: after an
      // in-app switch `model` is still the previous model, whose answer for
      // this id would be about something else.
      if (pendingPreviewPickRef.current !== null && useStore.getState().indexedModel === null) {
        if (!isStale) {
          setSelectedElement(null)
        }
        return
      }
      // If current selection is not empty
      if (selectedElements.length > 0) {
        // Properties follow the last *clicked* element. Reading
        // `selectedElements` here showed a descendant instead: picking
        // a container adds its whole subtree so the scene highlights,
        // and the deepest child landed last in that array.
        const anchors = (selectedAnchorIds && selectedAnchorIds.length > 0) ?
          selectedAnchorIds : selectedElements
        const lastId = anchors.slice(-1)[0]
        // Prefer the model-level `getItemProperties(id)` when present
        // — for cache-hit GLB it's the closure attached by
        // `Loader.js#convertToShareModel` from the
        // BLDRS_element_properties cache (works without a live IFC
        // parser); for cache-miss IFC it's wit-three's IFCModel
        // prototype method (delegates to the same ifcManager that
        // `viewer.getProperties` would hit). `viewer.getProperties`
        // stays as the fallback for non-IFC models / pre-decoration
        // ticks where the model-level method isn't attached yet.
        let props = null
        // While geometry streams the tree is up but `model` is not this load's
        // yet (open-205 #2029): read from the model at its index then.
        const propsModel = selectReadModel(useStore.getState())
        if (propsModel && typeof propsModel.getItemProperties === 'function') {
          props = await propsModel.getItemProperties(Number(lastId))
        }
        if (!props && typeof viewer.getProperties === 'function') {
          props = await viewer.getProperties(0, Number(lastId))
        }
        // STEP scene pick on a cache-hit GLB: `lastId` is the geometry's
        // shared product_definition_shape, which BLDRS_element_properties
        // never captured (it is seeded from spatial-tree nodes only, and a
        // shape is not one) — so both lookups above miss and the panel went
        // blank. The same pick also recorded which occurrence was clicked;
        // its leaf is the part's tree node, which IS captured — so resolve
        // the leaf, and only the leaf. Walking on up to an ancestor when the
        // leaf is missing would put a parent assembly's properties beside a
        // scene and NavTree that still select the part (codex on #1876);
        // the empty state is the honest answer then. A live parse answers
        // the shape id directly, so this only runs on the cached path.
        const occurrenceLeaf = Array.isArray(selectedOccurrencePath) ?
          selectedOccurrencePath[selectedOccurrencePath.length - 1] : undefined
        if (!props && occurrenceLeaf !== undefined && propsModel &&
            typeof propsModel.getItemProperties === 'function') {
          props = await propsModel.getItemProperties(Number(occurrenceLeaf))
        }
        if (isStale) {
          return
        }
        setSelectedElement(props)
        // Reveal the selection in the NavTree by opening the path to it, merged
        // into the current expansion (see `expandedIdsForSelection`). For a STEP
        // occurrence this keys off the occurrence path rather than `lastId` —
        // on a scene pick `lastId` is the geometry's shared
        // product_definition_shape, which isn't a tree node, so the old
        // parent-path lookup missed and deep/reused nodes never expanded.
        const pathIds = (selectedOccurrencePath && selectedOccurrencePath.length > 0) ?
          null : getParentPathIdsForElement(elementsById, parseInt(lastId))
        const nextExpanded = expandedIdsForSelection({
          prevExpanded: useStore.getState().expandedElements,
          occurrencePath: selectedOccurrencePath,
          rootExpressId: rootElement?.expressID,
          pathIds,
        })
        setExpandedElements(nextExpanded)
        const types = elementTypesMap.filter(
          (t) => t.elements.filter(
            (e) => ids.includes(e.expressID)).length > 0)
          .map((t) => t.name)
        if (types.length > 0) {
          setExpandedTypes([...new Set(types.concat(expandedTypes))])
        }
      } else {
        setSelectedElement(null)
      }
    })()
    return () => {
      isStale = true
    }
  }, [selectedElements, selectedAnchorIds, selectedInstanceIds, selectedOccurrencePath])
  /* eslint-enable */


  // NOTE: Do not resize the 3D canvas when drawers open/resize.
  // Drawers should overlay the viewer without changing its dimensions.

  useEffect(() => {
    const setViewportHeight = () => {
      setVh(window.innerHeight)
    }
    window.addEventListener('resize', setViewportHeight)
    return () => {
      window.removeEventListener('resize', setViewportHeight)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => stopModelEngagementRef.current?.(), [])

  // Expose the selection funnel to non-React callers — the Assist view tools
  // (src/viewer/tools/, ai-workspace.md §9). `selectItemsInScene` is a fresh
  // closure every render, so the registered wrapper reads the ref, refreshed
  // each render: a tool call reaches the same funnel a NavTree click does,
  // with this render's viewer, element table and router. Registered once per
  // mount and cleared on unmount.
  selectItemsInSceneRef.current = selectItemsInScene
  useEffect(() => registerSelectionFunnel((...args) => selectItemsInSceneRef.current(...args)), [])
  // `window.__bldrsAssistTools`, the tool registry's dev hook, under
  // `?feature=assist` only. Follows the URL, not just the mount: CadView
  // stays mounted across navigation, so the hook installs when the flag
  // appears and the cleanup uninstalls it when the flag goes.
  useEffect(() => (isAssistEnabled ? installAssistDevHook() : undefined), [isAssistEnabled])
  // `window.__bldrsEngine` (engine-worker.md §7 step 2): drives engine
  // sessions directly, for the E2E, before any load goes through them.
  // Same install-on-flag, uninstall-on-unflag shape as the assist hook.
  useEffect(() => (isEngineWorkerEnabled ? installEngineDevHook() : undefined), [isEngineWorkerEnabled])
  // `?view=` rules cannot run on a worker-engine model; say so (engine-worker.md
  // §8 item 7).
  useLegacyViewRulesNotice(model, setSnackMessage)


  const abs = {position: 'absolute'}
  const absTop = {top: 0, ...abs}
  // TODO(pablo): need to set the height on the row stack below to keep them
  // from expanding
  return (
    <Box sx={{...absTop, left: 0, width: '100vw', height: isMobile ? `${vh}px` : '100vh', m: 0, p: 0}}>
      {<ViewerContainer/>}
      <VisibilityHashWriter/>
      <SelectionHashWriter/>
      {/*
        * Unmounted during isolation, matching its toolbar toggle in
        * ElementsControl. The persisted visibility is left alone, so the
        * cube comes back when isolation ends.
        */}
      {viewer && isViewCubeVisible && !isTempIsolationModeOn && <ViewCube/>}
      {viewer && (
        <RootLandscape
          pathPrefix={pathPrefix}
          branch={modelPath.branch}
          selectWithShiftClickEvents={
            (isShiftKeyDown, expressIdOrIds, occurrencePath = null, hasChildren = false,
              isEphemeralSolid = false) => {
              // The element-types tree passes an array (every element of a
              // type) to select the group at once; the spatial tree and
              // the scene pass a single expressID. elementSelection is
              // single-id (shift toggle + descendants); the group case
              // replaces the selection wholesale, like a search result, so
              // it goes straight to the funnel with no permalink.
              if (Array.isArray(expressIdOrIds)) {
                selectItemsInScene(expressIdOrIds, false)
              } else if (occurrencePath && occurrencePath.length > 0 && !isShiftKeyDown) {
                // STEP occurrence node (non-shift). The tree node's id is its NAUO
                // express id, but the geometry is keyed by the shared
                // product_definition_shape, so parent-level selection
                // (elementSelection → setSelection) can't reach the mesh — the
                // occurrence path is the only shared key. Resolve it to the exact
                // instance ids and drive the per-instance highlight directly,
                // mirroring the scene-pick funnel. The node's expressID stays the
                // "selection" so properties / nav / the tree's per-occurrence
                // highlight (selectedOccurrencePath) all key off it.
                //
                // Shift-click falls through to elementSelection instead, which
                // toggles/accumulates against the current selection (multi-select);
                // the per-occurrence scene highlight is single-selection only, so
                // shift keeps its legacy type-level accumulate behavior.
                // An ephemeral solid node's own express id
                // (= PlacedGeometry.geometryExpressID) narrows the resolution
                // to the one clicked body — necessary for a pre-conway#628
                // solid, which shares its part's path, and harmless for a
                // #628 body, whose path already names it alone.
                const solidExpressId = isEphemeralSolid ? parseInt(expressIdOrIds, 10) : null
                const instanceIds =
                  occurrenceInstanceIds(occurrencePath, hasChildren, solidExpressId)
                selectItemsInScene(
                  [expressIdOrIds], true, instanceIds, occurrencePath, solidExpressId)
              } else {
                elementSelection(viewer, elementsById, selectItemsInScene, isShiftKeyDown, expressIdOrIds)
              }
            }}
          deselectItems={deselectItems}
        />
      )}
    </Box>
  )
}
