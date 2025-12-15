import React, {ReactElement, useEffect, useState} from 'react'
import {useNavigate, useSearchParams, useLocation} from 'react-router-dom'
import {MeshLambertMaterial} from 'three'
import {Box} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {captureException} from '@sentry/react'
import {filetypeRegex} from '../Filetype'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {onHash} from '../Components/Camera/CameraControl'
import {gtagEvent} from '../privacy/analytics'
import {resetState as resetCutPlaneState} from '../Components/CutPlane/CutPlaneMenu'
import {useIsMobile} from '../Components/Hooks'
import {load} from '../loader/Loader'
import useStore from '../store/useStore'
import {getParentPathIdsForElement, setupLookupAndParentLinks} from '../utils/TreeUtils'
import {areDefinedAndNotNull, assertDefined} from '../utils/assert'
import debug from '../utils/debug'
import {disablePageReloadApprovalCheck} from '../utils/event'
import {groupElementsByTypes} from '../utils/ifc'
import {navWith} from '../utils/navigate'
import {addProperties} from '../utils/objects'
import {isOutOfMemoryError} from '../utils/oom'
import {setKeydownListeners} from '../utils/shortcutKeys'
import Picker from '../view/Picker'
import RootLandscape from './RootLandscape'
import ViewerContainer from './ViewerContainer'
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
  const hasGitHubIdentity = useStore((state) => state.hasGithubIdentity)
  const customViewSettings = useStore((state) => state.customViewSettings)
  const elementTypesMap = useStore((state) => state.elementTypesMap)
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const rightDrawerWidth = useStore((state) => state.rightDrawerWidth)
  const appsDrawerWidth = useStore((state) => state.appsDrawerWidth)
  const preselectedElementIds = useStore((state) => state.preselectedElementIds)
  const searchIndex = useStore((state) => state.searchIndex)
  const selectedElements = useStore((state) => state.selectedElements)
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
  const sidebarWidth = (isNotesVisible ? rightDrawerWidth : 0) + (isAppsVisible ? appsDrawerWidth : 0)
  const viewer = useStore((state) => state.viewer)

  // AppSlice
  const isOpfsAvailable = useStore((state) => state.isOpfsAvailable)
  const setAppPrefix = useStore((state) => state.setAppPrefix)

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
      setViewer(initializedViewer)
    }
    // Don't call first time since component states get set from permalinks
    if (isModelReady) {
      resetState()
    }
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

    if (isAuthLoading || (!isAuthLoading &&
      (isAuthenticated && ( accessToken === '' && !hasGitHubIdentity )))) {
      debug().warn('Do not have auth token yet, waiting.')
      return
    }

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

    if (viewer.IFC.selector) {
      viewer.IFC.selector.preselection.material = preselectMat
      viewer.IFC.selector.selection.material = selectMat
    }

    debug().log('CadView#onViewer: modelPath:', modelPath)
    let tmpModelRef
    let isOOM = false
    try {
      tmpModelRef = await loadModel(modelPath)
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
      } else {
        setAlert(e)
      }

      console.error(e)
      captureException(e)
      return
    }
    if (!tmpModelRef && !isOOM) {
      setAlert('Failed to parse model')
      return
    }
    setIsModelLoading(false)
    setSnackMessage(null)

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

    const cameraControls = viewer.IFC.context.ifcCamera.cameraControls
    // Our visual testing waits until animations are finished to take screenshot
    // Would like to use zero but doesn't work
    // viewer.IFC.context.ifcCamera.cameraControls.restThreshold = 0.1
    cameraControls.addEventListener('rest', () => {
      trackModelInteraction()
    })
  }


  /**
   * Load IFC helper used by 1) useEffect on path change and 2) upload button
   *
   * @param {object} routeResult
   * @param {string} gitpath to use for constructing API endpoints
   * @return {object} loaded model
   */
  async function loadModel(routeResult) {
    const filepath = routeResult.downloadUrl || routeResult.filepath
    const gitpath = routeResult.gitpath
    const loadingMessageBase = `Loading ${filepath}`
    setIsModelLoading(true)
    setSnackMessage(`${loadingMessageBase}`)

    // Call this before loader, as IFCLoader needs it.
    viewer.setCustomViewSettings(customViewSettings)

    const onProgress = (progressMsg) => {
      let msg
      if (progressMsg && typeof progressMsg === 'object') {
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
      loadedModel = await load(filepath, viewer, onProgress,
        (gitpath && gitpath === 'external') ? false : isOpfsAvailable, setOpfsFile, accessToken)
    } catch (error) {
      if (isOutOfMemoryError(error)) {
        error.isOutOfMemory = true
        throw error
      }

      setAlert(error)
      return
    } finally {
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

    const isCamHashSet = onHash(location, viewer.IFC.context.ifcCamera.cameraControls)
    if (!isCamHashSet) {
      viewer.IFC.context.ifcCamera.currentNavMode.fitModelToFrame()
    }

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
      rootElt = await m.ifcManager.getSpatialStructure(0, true)
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
      const pickedAll = picker.castRay(viewer.context.scene.scene.children)
      if (pickedAll.length === 0) {
        return
      }
      const picked = pickedAll[0]
      const mesh = picked.object
      // TODO(pablo): obsolete? needed this in h3 at some point
      viewer.setHighlighted([mesh])
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
   * @param {object} m The IfcViewerAPIExtended instance.
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
   * Pick the given items in the scene.
   *
   * @param {Array} resultIDs Array of expressIDs
   * @param {boolean} updateNavigation Whether to update navigation
   */
  function selectItemsInScene(resultIDs, updateNavigation = true) {
    // NOTE: we might want to compare with previous selection to avoid unnecessary updates
    if (!viewer) {
      return
    }
    try {
      // Update The Component state
      const resIds = resultIDs.map((id) => `${id}`)
      setSelectedElements(resIds)
      // Sets the url to the first selected element path.
      if (resultIDs.length > 0 && updateNavigation) {
        const firstId = resultIDs.slice(0, 1)
        const pathIds = getParentPathIdsForElement(elementsById, parseInt(firstId))
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
      const selectedInViewer = viewer.getSelectedIds()
      if (isFinite(targetId) && !selectedInViewer.includes(targetId)) {
        selectItemsInScene([targetId], false)
      }
    }
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
      // This function gets called whenever there's a change in authentication state
      debug().log('Auth state changed. isAuthLoading:', isAuthLoading, 'isAuthenticated:', isAuthenticated)
      /* eslint-disable no-mixed-operators */
      if (!isAuthLoading &&
          (isAuthenticated && ( accessToken !== '' || !hasGitHubIdentity )) ||
          (!isAuthLoading && !isAuthenticated) && isOpfsAvailable !== null) {
        (async () => {
          await onViewer()
        })()
      }
      /* eslint-enable no-mixed-operators */
    }
  }, [isAuthLoading, isAuthenticated, accessToken, isOpfsAvailable])


  // ModelPath changes in parent (ShareRoutes) from user and
  // programmatic navigation (e.g. clicking element links).
  useEffect(() => {
    debug().log('CadView#useEffect1[modelPath], calling onModelPath, modelPath:', modelPath)
    onModelPath()
  }, [modelPath, customViewSettings])


  // Viewer changes in onModelPath (above)
  useEffect(() => {
    (async () => {
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
      const parts = location.pathname.split(filetypeRegex)
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
      // If current selection is not empty
      if (selectedElements.length > 0) {
        // Display the properties of the last one,
        const lastId = selectedElements.slice(-1)[0]
        const props = await viewer.getProperties(0, Number(lastId))
        setSelectedElement(props)
        // Update the expanded elements in NavTreePanel
        const pathIds = getParentPathIdsForElement(elementsById, parseInt(lastId))
        if (pathIds) {
          setExpandedElements(pathIds.map((n) => `${n}`))
        }
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
  }, [selectedElements])
  /* eslint-enable */


  // Shrink the scene viewer when drawer is open.  This recenters the
  // view in the new shrunk canvas, which preserves what the user is
  // looking at.
  // TODO(pablo): add render testing
  useEffect(() => {
    const isDrawerOpen = isNotesVisible || isAppsVisible
    if (viewer && !isMobile) {
      viewer.container.style.width = isDrawerOpen ? `calc(100vw - ${sidebarWidth}px)` : '100vw'
      viewer.context.resize()
    }
  }, [isNotesVisible, isAppsVisible, isMobile, viewer, sidebarWidth])

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
          selectWithShiftClickEvents={(isShiftKeyDown, expressId) => {
            elementSelection(viewer, elementsById, selectItemsInScene, isShiftKeyDown, expressId)
          }}
          deselectItems={deselectItems}
        />
      )}
    </Box>
  )
}
