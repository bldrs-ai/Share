import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {useNavigate, useSearchParams, useLocation} from 'react-router-dom'
import {MeshLambertMaterial} from 'three'
import {Box} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {captureException} from '@sentry/react'
import {fileSuffixBoundaryRegex} from '../Filetype'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {onHash} from '../Components/Camera/CameraControl'
import {gtagEvent} from '../privacy/analytics'
import {getRenderMode} from '../privacy/preferences'
import {resetState as resetCutPlaneState} from '../Components/CutPlane/CutPlaneMenu'
import {useIsMobile} from '../Components/Hooks'
import {load} from '../loader/Loader'
import {
  attachLoadFailureContext,
  beginLoadProgress,
  endLoadProgress,
  formatLoadProgress,
  isStructuredProgress,
  reportLoadProgress,
} from '../loader/loadProgress'
import {NeedsReconnectError} from '../connections/errors'
import {getBrowser} from '../connections/registry'
import useStore from '../store/useStore'
import {expandedIdsForSelection, getParentPathIdsForElement, setupLookupAndParentLinks} from '../utils/TreeUtils'
import {areDefinedAndNotNull, assertDefined} from '../utils/assert'
import debug from '../utils/debug'
import {disablePageReloadApprovalCheck} from '../utils/event'
import {groupElementsByTypes} from '../utils/ifc'
import {navWith} from '../utils/navigate'
import {addProperties} from '../utils/objects'
import {
  findNodeByOccurrencePath,
  occurrencePathKey,
  occurrencePathKeySetForTree,
  occurrencePathsEqual,
  trimToTreeOccurrencePath,
} from '../utils/occurrencePaths'
import {isOutOfMemoryError} from '../utils/oom'
import {setKeydownListeners} from '../utils/shortcutKeys'
import Picker from '../viewer/three/Picker'
import {DEFAULT_LOOK} from '../viewer/looks'
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
  const customViewSettings = useStore((state) => state.customViewSettings)
  const elementTypesMap = useStore((state) => state.elementTypesMap)
  const preselectedElementIds = useStore((state) => state.preselectedElementIds)
  const searchIndex = useStore((state) => state.searchIndex)
  const selectedElements = useStore((state) => state.selectedElements)
  const selectedInstanceIds = useStore((state) => state.selectedInstanceIds)
  const selectedOccurrencePath = useStore((state) => state.selectedOccurrencePath)
  const setSelectedInstanceIds = useStore((state) => state.setSelectedInstanceIds)
  const setSelectedOccurrencePath = useStore((state) => state.setSelectedOccurrencePath)
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

  // IFCSlice
  const model = useStore((state) => state.model)
  const setIsModelLoading = useStore((state) => state.setIsModelLoading)
  const isModelReady = useStore((state) => state.isModelReady)
  const setIsModelReady = useStore((state) => state.setIsModelReady)
  const setModel = useStore((state) => state.setModel)

  // NavTreeSlice
  const expandedTypes = useStore((state) => state.expandedTypes)
  const setDefaultExpandedElements = useStore((state) => state.setDefaultExpandedElements)
  const setDefaultExpandedTypes = useStore((state) => state.setDefaultExpandedTypes)
  const setExpandedElements = useStore((state) => state.setExpandedElements)
  const setExpandedTypes = useStore((state) => state.setExpandedTypes)

  // RepositorySlice
  const modelPath = useStore((state) => state.modelPath)

  const setLoadProgress = useStore((state) => state.setLoadProgress)

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
  const setOpfsFile = useStore((state) => state.setOpfsFile)
  const navigate = useNavigate()
  // TODO(pablo): Removing this setter leads to a very strange stack overflow
  const [searchParams] = useSearchParams()

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
      debug().warn('CadView#onViewer: already in flight; skipping duplicate')
      return
    }
    onViewerInFlightRef.current = true
    try {
      await onViewerInternal()
    } finally {
      onViewerInFlightRef.current = false
    }
  }


  /** Inner load body — preconditions checked + in-flight flag managed by `onViewer`. */
  async function onViewerInternal() {
    setIsModelReady(false)

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
    const isAuthSettledBeforeLoad = needsGithubAuth ?
      await waitForAuthSettled(AUTH_SETTLE_GRACE_MS) :
      true

    let tmpModelRef
    let isOOM = false
    try {
      tmpModelRef = await loadModelWithAuthRetry(modelPath, isAuthSettledBeforeLoad)
    } catch (e) {
      if (isOutOfMemoryError(e)) {
        isOOM = true
      }
      if (isOOM) {
        // Provide actionable OOM alert object; AlertDialog will render a Refresh button.
        setAlert({
          type: 'oom',
          message: 'We ran out of memory attempting to load this model. ' +
            'Try opening it on a desktop browser with more memory or ' +
            'refresh the page.',
        })
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
      } else {
        setAlert(e)
      }

      console.error(e)
      // load.* tags + context from the last progress event, so this
      // capture groups by phase in Sentry instead of landing in one
      // detail-free "model loading failed" bucket (conway #301 §7).
      attachLoadFailureContext()
      captureException(e)
      return
    } finally {
      // Whatever the outcome, this load attempt is over. The overlay/snack
      // may still be up (set before the grace wait above, or re-set by the
      // authed-retry path after loadModel's own finally cleared it) — a
      // load that ends in an alert must not leave the LoadingBackdrop
      // blocking the error dialog.
      setIsModelLoading(false)
      setSnackMessage(null)
    }
    if (!tmpModelRef && !isOOM) {
      setAlert('Failed to parse model')
      return
    }

    debug().log('CadView#onViewer: pathToLoad(${pathToLoad}), tmpModelRef: ', tmpModelRef)
    await onModel(tmpModelRef)

    const pathToLoad = modelPath.srcUrl || modelPath.gitpath || (installPrefix + modelPath.filepath)
    selectElementBasedOnFilepath(pathToLoad)
    // maintain hidden elements if any
    const previouslyHiddenELements = Object.entries(useStore.getState().hiddenElements)
      .filter(([, value]) => value === true).map(([key]) => Number(key))
    if (previouslyHiddenELements.length > 0) {
      viewer.isolator.unHideAllElements()
      viewer.isolator.hideElementsById(previouslyHiddenELements)
    }

    modelPath.title = tmpModelRef.name // maybe undefined
    setIsViewerLoaded(true)
    setIsModelReady(true)

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
   * before auth settled (grace window in onViewerInternal expired, so
   * probably no token) and failed auth-shaped — GitHub masks private repos
   * as 404 to anonymous callers and rate-limits anonymous IPs with 403 —
   * wait for the token to land and retry once with it. Everything else
   * rethrows to onViewerInternal's catch unchanged.
   *
   * @param {object} routeResult
   * @param {boolean} isAuthSettledBeforeLoad
   * @return {object} loaded model
   */
  async function loadModelWithAuthRetry(routeResult, isAuthSettledBeforeLoad) {
    try {
      return await loadModel(routeResult)
    } catch (error) {
      if (isAuthSettledBeforeLoad || !isAuthShapedLoadError(error)) {
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
      return await loadModel(routeResult)
    }
  }


  /**
   * Load IFC helper used by 1) useEffect on path change and 2) upload button
   *
   * @param {object} routeResult
   * @param {string} gitpath to use for constructing API endpoints
   * @return {object} loaded model
   */
  async function loadModel(routeResult) {
    const isGoogleResult = routeResult.kind === 'provider' && routeResult.provider === 'google'
    const filepath = isGoogleResult ? routeResult.downloadUrl : (routeResult.downloadUrl || routeResult.filepath)
    const gitpath = routeResult.gitpath
    const loadingMessageBase = `Loading ${isGoogleResult ? routeResult.fileId : filepath}`
    setIsModelLoading(true)
    setSnackMessage(`${loadingMessageBase}`)

    // Call this before loader, as IFCLoader needs it.
    viewer.setCustomViewSettings(customViewSettings)

    // Per-load progress reporter (conway #301): drives the determinate
    // backdrop, mirrors the phase timeline into Sentry breadcrumbs, and
    // watches for stalls. Disposed in the finally below.
    beginLoadProgress({
      fileInfo: isGoogleResult ? `gdrive:${routeResult.fileId}` : filepath,
      onEvent: (event) => setLoadProgress(event),
      onStall: (lastEvent) => {
        const where = lastEvent ? `: last progress ${formatLoadProgress(lastEvent)}` : ''
        setSnackMessage(`${loadingMessageBase}: still working${where}…`)
      },
    })

    const onProgress = (progressMsg) => {
      reportLoadProgress(progressMsg)
      let msg
      if (isStructuredProgress(progressMsg)) {
        // Structured conway ProgressEvent — phase label + percent in the
        // snackbar, full detail on the backdrop via the store.
        msg = formatLoadProgress(progressMsg)
      } else if (progressMsg && typeof progressMsg === 'object') {
        const loadedBytes = progressMsg.loaded ?? progressMsg.receivedLength
        if (Number.isFinite(loadedBytes)) {
          // eslint-disable-next-line no-magic-numbers
          const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
          msg = `${loadedMegs} MB`
        } else {
          msg = JSON.stringify(progressMsg)
        }
      } else {
        msg = progressMsg
      }
      setSnackMessage(`${loadingMessageBase}: ${msg}`)
    }
    let loadedModel
    try {
      if (isGoogleResult) {
        const connection = connections.find((c) => c.providerId === 'google-drive')
        if (connection) {
          // OAuth path: authenticated download for private files
          const browser = getBrowser('google-drive')
          const download = await browser.getFileDownload(connection, null, routeResult.fileId)
          const blobUrl = URL.createObjectURL(download.blob)
          loadedModel = await load(blobUrl, viewer, onProgress, false, setOpfsFile, '')
        } else {
          // API key fallback: works for public files and route tests without a connection
          loadedModel = await load(routeResult.downloadUrl, viewer, onProgress, false, setOpfsFile, '')
        }
      } else {
        // Read the token at call time, not from the render closure — the
        // auth grace/retry flow in onViewerInternal can land a token
        // mid-flight, and the closure would still hold the pre-resolution
        // (usually empty) value.
        const tokenNow = useStore.getState().accessToken
        loadedModel = await load(filepath, viewer, onProgress,
          (gitpath && gitpath === 'external') ? false : isOpfsAvailable, setOpfsFile, tokenNow)
      }
    } catch (error) {
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
      // Stall watchdog off, backdrop back to indeterminate/idle. The
      // reporter's last-event state stays queryable after end —
      // onViewerInternal's catch stamps it onto Sentry via
      // attachLoadFailureContext before capturing.
      endLoadProgress()
      setLoadProgress(null)
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

    const isCamHashSet = onHash(location, viewer.context.getCameraControls())
    if (!isCamHashSet) {
      viewer.context.fitModelToFrame()
    }

    // §6e: fit the contact-shadow ground + shadow frustum to the model's
    // bounds (valid now it's added + framed). Optional-chained: the Jest
    // viewer mock doesn't define it.
    viewer.groundModel?.(loadedModel)

    // §6e: apply the active render look's materials to the new model, so a
    // model opened while a non-default look is active still matches.
    viewer.applyLookToModel?.(loadedModel)

    // TODO(pablo): centralize capability check somewhere
    if (loadedModel.ifcManager) {
      await viewer.isolator.setModel(loadedModel)
    } else {
      console.warn('CadView#loadedModel: model without manager:', loadedModel)
    }

    const selectContentObj = {
      content_type: loadedModel.type || 'undefined',
      content_id: filepath,
    }
    // TODO(pablo): currently only IFC/STEP are populated with stats.
    if (loadedModel.loadStats) {
      addProperties(selectContentObj, loadedModel.loadStats, 'stats_')
    }
    gtagEvent('select_content', selectContentObj)

    return loadedModel
  }


  /**
   * Analyze loaded IFC model to configure UI elements.
   *
   * @param {object} m IFCjs loaded model.
   */
  async function onModel(m) {
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
    let rootElt
    try {
      // Three sources, in preference order:
      //   1. Model's own `getSpatialStructure` (instance method) — attached
      //      by `decorateConwayDirectIfcModel` on cache-miss Conway-direct
      //      parses (routes to `ifcAPI.properties.getSpatialStructure`),
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
      setAlert('Could not read full model structure.  Only model geometry will be available.')
      captureException(e, 'Could not read full model structure')
      console.error(e)
      return
    }
    debug().log('CadView#onModel: rootElt: ', rootElt)
    if (rootElt.expressID === undefined) {
      throw new Error('Model has undefined root express ID')
    }
    setupLookupAndParentLinks(rootElt, elementsById)
    initSearch(m, rootElt)
    const tmpProps = await viewer.getProperties(0, rootElt.expressID)
    const rootProps = tmpProps || {Name: {value: 'Model'}, LongName: {value: 'Model'}}
    rootElt.Name = rootProps.Name
    rootElt.LongName = rootProps.LongName
    setRootElement(rootElt)
    setElementTypesMap(groupElementsByTypes(rootElt))
    // Load-time property reads are done: drop Conway's materialised
    // entity/descriptor caches (the 'names' walk + type sweep touched
    // O(products) entities). Entities rematerialise transparently on the
    // next property access (Properties panel, GLB cache writer), so this
    // only bounds memory. Conway extension — optional-chained so older
    // conway versions no-op. The IsModelOpen gate keeps cache-hit GLB
    // loads silent: they share the live conway ifcAPI via
    // `viewer.IFC.loader.ifcManager` without ever opening model 0, and
    // an ungated release would log a spurious model-undefined error.
    const conwayApi = m.ifcManager?.ifcAPI
    // eslint-disable-next-line new-cap
    if (conwayApi?.ReleaseEntityCache && conwayApi.IsModelOpen?.(0)) {
      // eslint-disable-next-line new-cap
      conwayApi.ReleaseEntityCache(0)
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
      const pickedAll = picker.castRay(viewer.context.getScene().children)
      if (pickedAll.length === 0) {
        return
      }
      const picked = pickedAll[0]
      const mesh = picked.object
      // TODO(pablo): obsolete? needed this in h3 at some point.
      // A BatchedMesh must NOT reach the OutlineEffect: three auto-enables
      // `USE_BATCHING` for it, but postprocessing's outline ShaderMaterial
      // (DepthComparisonMaterial) predates BatchedMesh and omits the batching
      // shader chunks, so its program fails to compile (`batchingMatrix`
      // undeclared) and blanks the frame. The batched path highlights by
      // recoloring instances (batchedHighlight) instead, so clear the outline
      // rather than feed it the batch.
      viewer.setHighlighted(mesh.isBatchedMesh ? null : [mesh])
      // Per-instance picking path (Conway-direct):
      //   no-shift = just this PlacedGeometry
      //   shift     = the whole IFC element (every instance)
      //
      // Note this DISPLACES the legacy "Shift = add to multi-select"
      // semantic in `elementSelection` when the model carries an
      // instanceMap. Multi-select is rarely-used in the IFC workflow;
      // per-instance picking is the primary improvement from the
      // viewer-replacement work, so it wins the modifier slot. Models
      // without an instanceMap (today's wit-three path, GLB cache hit)
      // keep the legacy Shift behavior unchanged.
      // BatchedMesh render path (`?feature=batchedMesh`): the raycast sets
      // `batchId` (the per-instance id); resolve it to the parent IFC
      // product through the tables `buildBatchedConwayModel` attached.
      // Selection highlights every occurrence of that product (parent-level
      // subset, via the model's `createSubset`). Per-occurrence narrowing
      // would need `instancePicking`, which the batched model doesn't carry
      // yet — so we pass no instanceIds (avoids a no-op `setInstanceSelection`
      // + its warn). See design/new/viewer-replacement.md §3b.iv.
      if (mesh.isBatchedMesh && mesh.instanceParents) {
        const batchId = picked.batchId
        if (batchId === undefined || batchId < 0) {
          return
        }
        const parentExpressId = mesh.instanceParents[batchId]
        if (parentExpressId === undefined || !viewer.isolator.canBePickedInScene(parentExpressId)) {
          return
        }
        selectItemsInScene([parentExpressId], true, [])
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
        // Route through selectItemsInScene (the single selection
        // funnel) so a scene pick gets the same treatment as every
        // other source: store update + element-path permalink in the
        // URL. Previously this set the store directly and skipped the
        // funnel, so scene selections never produced a shareable
        // permalink. The parent expressID is always the "selection" so
        // the properties panel / nav tree / search respond normally;
        // `instanceIds` only narrows what the OutlineEffect draws.
        // Shift = the whole IFC element (every instance) → no
        // per-instance restriction; no-shift = just this PlacedGeometry.
        const instanceIds = event.shiftKey ? [] : [instanceId]
        // STEP: the picked instance's occurrence path so the NavTree highlights
        // the one occurrence, not every reuse of the part type. Null on shift
        // (whole element) and for IFC / single-occurrence parts.
        //
        // The geometry path can be deeper than any tree node's — Conway
        // appends a segment per child shape_representation level, and an
        // SRR-attached brep (Alibre exports) adds a non-NAUO id below the
        // leaf — so trim to the deepest tree-known prefix or the NavTree's
        // exact-key matches (row highlight, scroll) find nothing. The store
        // is read imperatively: this handler is installed once from
        // `onModel`, before that render's `rootElement` is set.
        const rawOccurrencePath = event.shiftKey ? null :
          (mesh.instanceMap.getOccurrencePathByInstance?.(instanceId) ?? null)
        const occurrencePath = rawOccurrencePath ?
          trimToTreeOccurrencePath(
            rawOccurrencePath,
            occurrencePathKeySetForTree(useStore.getState().rootElement)) :
          null
        selectItemsInScene([parentExpressId], true, instanceIds, occurrencePath)
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
    resetCutPlaneState(location, viewer, setCutPlaneDirections, setIsCutPlaneActive)
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
   */
  function selectItemsInScene(resultIDs, updateNavigation = true, instanceIds = [], occurrencePath = null) {
    // NOTE: we might want to compare with previous selection to avoid unnecessary updates
    if (!viewer) {
      return
    }
    try {
      // Update The Component state
      const resIds = resultIDs.map((id) => `${id}`)
      setSelectedElements(resIds)
      setSelectedInstanceIds(instanceIds)
      // STEP per-occurrence key: a reused part's occurrences share one
      // expressID, so this disambiguates which NavTree node to highlight.
      // Every non-occurrence caller passes null, clearing any stale path.
      setSelectedOccurrencePath(occurrencePath)
      // Sets the url to the first selected element path.
      if (resultIDs.length > 0 && updateNavigation) {
        const firstId = resultIDs.slice(0, 1)
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
        const pathIds = isTreeOccurrencePath ?
          [rootElt.expressID, ...occurrencePath] :
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
   */
  function selectElementBasedOnFilepath(filepath) {
    if (filepath.startsWith('/')) {
      filepath = filepath.substring(1)
    }
    const parts = filepath.split(/\//)
    if (parts.length > 1) {
      debug().log('CadView#selectElementBasedOnUrlPath: have path', parts)
      const targetId = parseInt(parts[parts.length - 1])
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
      // `findNodeByOccurrencePath` is the single tree-membership gate (a
      // non-null node ⟺ the tree knows the path) and its node supplies
      // `hasChildren` for the scene resolution below. Null for IFC (nodes
      // carry no occurrence paths) and for element paths the tree doesn't
      // know — those keep the plain scalar-id selection.
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
      const node = startsAtRoot ?
        findNodeByOccurrencePath(state.rootElement, eltPathIds) : null
      const occurrencePath = node ? eltPathIds : null
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
      const alreadySelected = (occurrencePath && state.selectedOccurrencePath) ?
        occurrencePathsEqual(occurrencePath, state.selectedOccurrencePath) :
        idSelected
      if (alreadySelected) {
        return
      }
      // Mirror the NavTree occurrence-click funnel: resolve the path to the
      // exact instance ids so the scene highlights just this occurrence
      // (`includeDescendants` per the node's children — an assembly needs
      // the descendant scan, a leaf takes the exact-key path). Empty for the
      // scalar-id (IFC / unknown-path) case, where occurrencePath is null.
      const hasChildren = Boolean(node && Array.isArray(node.children) && node.children.length > 0)
      const instanceIds = occurrencePath ? occurrenceInstanceIds(occurrencePath, hasChildren) : []
      selectItemsInScene([targetId], false, instanceIds, occurrencePath)
    }
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
   * @return {Array<number>} synthetic instance ids
   */
  function occurrenceInstanceIds(occurrencePath, includeDescendants) {
    return typeof viewer.getInstanceIdsForOccurrencePath === 'function' ?
      viewer.getInstanceIdsForOccurrencePath(0, occurrencePath, {includeDescendants}) : []
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
      if (parts.length === expectedPartCount && parts[1] !== '') {
        selectElementBasedOnFilepath(parts[1])
      }
    }
  }, [location, model, rootElement])


  useEffect(() => {
    (async () => {
      if (!Array.isArray(selectedElements) || !viewer) {
        return
      }
      // Update The selection on the scene pick/unpick
      const ids = selectedElements.map((id) => parseInt(id))
      await viewer.setSelection(0, ids)
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
      // If current selection is not empty
      if (selectedElements.length > 0) {
        // Display the properties of the last one,
        const lastId = selectedElements.slice(-1)[0]
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
        if (model && typeof model.getItemProperties === 'function') {
          props = await model.getItemProperties(Number(lastId))
        }
        if (!props && typeof viewer.getProperties === 'function') {
          props = await viewer.getProperties(0, Number(lastId))
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
  }, [selectedElements, selectedInstanceIds, selectedOccurrencePath])
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


  const abs = {position: 'absolute'}
  const absTop = {top: 0, ...abs}
  // TODO(pablo): need to set the height on the row stack below to keep them
  // from expanding
  return (
    <Box sx={{...absTop, left: 0, width: '100vw', height: isMobile ? `${vh}px` : '100vh', m: 0, p: 0}}>
      {<ViewerContainer/>}
      {viewer && (
        <RootLandscape
          pathPrefix={pathPrefix}
          branch={modelPath.branch}
          selectWithShiftClickEvents={
            (isShiftKeyDown, expressIdOrIds, occurrencePath = null, hasChildren = false) => {
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
                const instanceIds = occurrenceInstanceIds(occurrencePath, hasChildren)
                selectItemsInScene([expressIdOrIds], true, instanceIds, occurrencePath)
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
