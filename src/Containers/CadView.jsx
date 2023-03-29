import React, {useEffect, useState} from 'react'
import {Color, MeshLambertMaterial} from 'three'
import {useNavigate, useSearchParams, useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import {navToDefault} from '../Share'
import Alert from '../Components/Alert'
import BranchesControl from '../Components/BranchesControl'
import {useWindowDimensions} from '../Components/Hooks'
import Logo from '../Components/Logo'
import NavPanel from '../Components/NavPanel'
import SearchBar from '../Components/SearchBar'
import SideDrawer from '../Components/SideDrawer/SideDrawer'
import OperationsGroup from '../Components/OperationsGroup'
import SnackBarMessage from '../Components/SnackbarMessage'
import {hasValidUrlParams as urlHasCameraParams} from '../Components/CameraControl'
import {useIsMobile} from '../Components/Hooks'
import {IfcViewerAPIExtended} from '../Infrastructure/IfcViewerAPIExtended'
import * as Privacy from '../privacy/Privacy'
import debug from '../utils/debug'
import useStore from '../store/useStore'
import {computeElementPathIds, setupLookupAndParentLinks} from '../utils/TreeUtils'
import {assertDefined} from '../utils/assert'
import {handleBeforeUnload} from '../utils/event'
import {getDownloadURL, parseGitHubRepositoryURL} from '../utils/GitHub'
import SearchIndex from './SearchIndex'
import {usePlaceMark} from '../hooks/usePlaceMark'
import {getAllHashParams} from '../utils/location'


/**
 * Experimenting with a global. Just calling #indexElement and #clear
 * when new models load.
 */
export const searchIndex = new SearchIndex()
let count = 0


/**
 * Only container for the for the app.  Hosts the IfcViewer as well as
 * nav components.
 *
 * @return {object}
 */
export default function CadView({
  installPrefix,
  appPrefix,
  pathPrefix,
  modelPath,
}) {
  assertDefined(...arguments)
  debug().log('CadView#init: count: ', count++)
  // React router
  const navigate = useNavigate()
  // TODO(pablo): Removing this setter leads to a very strange stack overflow
  // eslint-disable-next-line no-unused-vars
  const [searchParams, setSearchParams] = useSearchParams()

  // IFC
  const [rootElement, setRootElement] = useState({})
  const [elementsById] = useState({})
  const [defaultExpandedElements, setDefaultExpandedElements] = useState([])
  const [expandedElements, setExpandedElements] = useState([])

  // UI elts
  const theme = useTheme()
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [alert, setAlert] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState()
  const [model, setModel] = useState(null)
  const viewer = useStore((state) => state.viewer)
  const setViewer = useStore((state) => state.setViewer)
  const isNavPanelOpen = useStore((state) => state.isNavPanelOpen)
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const setCutPlaneDirections = useStore((state) => state.setCutPlaneDirections)
  const setIsNavPanelOpen = useStore((state) => state.setIsNavPanelOpen)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const setModelStore = useStore((state) => state.setModelStore)
  const setSelectedElement = useStore((state) => state.setSelectedElement)
  const setSelectedElements = useStore((state) => state.setSelectedElements)
  const selectedElements = useStore((state) => state.selectedElements)
  const setViewerStore = useStore((state) => state.setViewerStore)
  const snackMessage = useStore((state) => state.snackMessage)
  const accessToken = useStore((state) => state.accessToken)
  const sidebarWidth = useStore((state) => state.sidebarWidth)
  const [modelReady, setModelReady] = useState(false)
  const isMobile = useIsMobile()
  const location = useLocation()

  // Granular visibility controls for the UI components
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  const isNavigationPanelVisible = useStore((state) => state.isNavigationPanelVisible)


  // Place Mark
  const {createPlaceMark, onSceneSingleTap, onSceneDoubleTap} = usePlaceMark()

  /* eslint-disable react-hooks/exhaustive-deps */
  // ModelPath changes in parent (ShareRoutes) from user and
  // programmatic navigation (e.g. clicking element links).
  useEffect(() => {
    debug().log('CadView#useEffect1[modelPath], calling onModelPath...')
    onModelPath()
  }, [modelPath])


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
      if (!Array.isArray(selectedElements) || !viewer) {
        return
      }
      // Update The selection on the scene pick/unpick
      await viewer.setSelection(0, selectedElements.map((id) => parseInt(id)))
      // If current selection is not empty
      if (selectedElements.length > 0) {
        // Display the properties of the last one,
        const lastId = selectedElements.slice(-1)
        const props = await viewer.getProperties(0, Number(lastId))
        setSelectedElement(props)
        // Update the expanded elements in NavPanel
        const pathIds = getPathIdsForElements(lastId)
        if (pathIds) {
          setExpandedElements(pathIds.map((n) => `${n}`))
        }
      } else {
        setSelectedElement(null)
      }
    })()
  }, [selectedElements])


  // Watch for path changes within the model.
  // TODO(pablo): would be nice to have more consistent handling of path parsing.
  useEffect(() => {
    if (model) {
      (() => {
        const parts = location.pathname.split(/\.ifc/i)
        const expectedPartCount = 2
        if (parts.length === expectedPartCount) {
          selectElementBasedOnFilepath(parts[1])
        }
      })()
    }
  }, [location, model])
  /* eslint-enable */


  /**
   * Begin setup for new model. Turn off nav, search and item and init
   * new viewer.
   */
  function onModelPath() {
    setIsNavPanelOpen(false)
    setShowSearchBar(false)
    // TODO(pablo): First arg isn't used for first time, and then it's
    // newMode for the themeChangeListeners, which is also unused.
    const initViewerCb = (any, themeArg) => {
      const initializedViewer = initViewer(
          pathPrefix,
          assertDefined(themeArg.palette.scene.background))
      setViewer(initializedViewer)
      setViewerStore(initializedViewer)
    }
    initViewerCb(undefined, theme)
    theme.addThemeChangeListener(initViewerCb)
  }


  /** When viewer is ready, load IFC model. */
  async function onViewer() {
    if (viewer === null) {
      debug().warn('CadView#onViewer, viewer is null')
      return
    }

    setModelReady(false)

    // define mesh colors for selected and preselected element
    const preselectMat = new MeshLambertMaterial({
      transparent: true,
      opacity: 0.5,
      color: theme.palette.secondary.background,
      depthTest: true,
    })
    const selectMat = new MeshLambertMaterial({
      transparent: true,
      color: theme.palette.secondary.main,
      depthTest: true,
    })

    if (viewer.IFC.selector) {
      viewer.IFC.selector.preselection.material = preselectMat
      viewer.IFC.selector.selection.material = selectMat
    }

    const pathToLoad = modelPath.gitpath || (installPrefix + modelPath.filepath)
    const tmpModelRef = await loadIfc(pathToLoad)
    debug().log('CadView#onViewer: tmpModelRef: ', tmpModelRef)
    await onModel(tmpModelRef)
    createPlaceMark({
      context: viewer.context,
      oppositeObjects: [tmpModelRef],
      postProcessor: viewer.postProcessor,
    })
    selectElementBasedOnFilepath(pathToLoad)
    setModelReady(true)
    // maintain hidden elements if any
    const previouslyHiddenELements = Object.entries(useStore.getState().hiddenElements)
        .filter(([key, value]) => value === true).map(([key, value]) => Number(key))
    if (previouslyHiddenELements.length > 0) {
      viewer.isolator.unHideAllElements()
      viewer.isolator.hideElementsById(previouslyHiddenELements)
    }
  }


  // Shrink the scene viewer when drawer is open.  This recenters the
  // view in the new shrunk canvas, which preserves what the user is
  // looking at.
  // TODO(pablo): add render testing
  useEffect(() => {
    if (viewer && !isMobile) {
      viewer.container.style.width = isDrawerOpen ? `calc(100% - ${sidebarWidth})` : '100%'
      viewer.context.resize()
    }
  }, [isDrawerOpen, isMobile, viewer, sidebarWidth])


  const setAlertMessage = (msg) =>
    setAlert(
        <Alert onCloseCb={() => {
          navToDefault(navigate, appPrefix)
        }} message={msg}
        />,
    )


  /**
   * Load IFC helper used by 1) useEffect on path change and 2) upload button.
   *
   * @param {string} filepath
   */
  async function loadIfc(filepath) {
    debug().log(`CadView#loadIfc: `, filepath)
    const uploadedFile = pathPrefix.endsWith('new')

    if (uploadedFile) {
      filepath = getNewModelRealPath(filepath)
      debug().log('CadView#loadIfc: parsed blob: ', filepath)
      window.addEventListener('beforeunload', handleBeforeUnload)
    }

    const loadingMessageBase = `Loading ${filepath}`
    setLoadingMessage(loadingMessageBase)
    setIsLoading(true)

    const ifcURL = (uploadedFile || filepath.indexOf('/') === 0) ? filepath : await getFinalURL(filepath, accessToken)
    const loadedModel = await viewer.loadIfcUrl(
        ifcURL,
        !urlHasCameraParams(), // fit to frame
        (progressEvent) => {
          if (Number.isFinite(progressEvent.loaded)) {
            const loadedBytes = progressEvent.loaded
            // eslint-disable-next-line no-magic-numbers
            const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
            setLoadingMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
            debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
          }
        },
        (error) => {
          debug().log('CadView#loadIfc$onError: ', error)
          // TODO(pablo): error modal.
          setIsLoading(false)
          setAlertMessage(`Could not load file: ${filepath}`)
        })
    await viewer.isolator.setModel(loadedModel)

    Privacy.recordEvent('select_content', {
      content_type: 'ifc_model',
      item_id: filepath,
    })
    setIsLoading(false)

    if (loadedModel) {
      // Fix for https://github.com/bldrs-ai/Share/issues/91
      //
      // TODO(pablo): huge hack. Somehow this is getting incremented to
      // 1 even though we have a new IfcViewer instance for each file
      // load.  That modelID is used in the IFCjs code as [modelID] and
      // leads to undefined refs e.g. in prePickIfcItem.  The id should
      // always be 0.
      loadedModel.modelID = 0
      setModel(loadedModel)
      setModelStore(loadedModel)
      return loadedModel
    }

    debug().error('CadView#loadIfc: Model load failed!')
    return loadedModel
  }


  /** Upload a local IFC file for display. */
  function loadLocalFile() {
    const viewerContainer = document.getElementById('viewer-container')
    const fileInput = document.createElement('input')
    fileInput.setAttribute('type', 'file')
    fileInput.addEventListener(
        'change',
        (event) => {
          debug().log('CadView#loadLocalFile#event:', event)
          let ifcUrl = URL.createObjectURL(event.target.files[0])
          debug().log('CadView#loadLocalFile#event: ifcUrl: ', ifcUrl)
          const parts = ifcUrl.split('/')
          ifcUrl = parts[parts.length - 1]
          window.removeEventListener('beforeunload', handleBeforeUnload)
          navigate(`${appPrefix}/v/new/${ifcUrl}.ifc`)
        },
        false,
    )
    viewerContainer.appendChild(fileInput)
    fileInput.click()
    viewerContainer.removeChild(fileInput)
  }


  /**
   * Analyze loaded IFC model to configure UI elements.
   *
   * @param {object} m IFCjs loaded model.
   */
  async function onModel(m) {
    assertDefined(m)
    debug().log('CadView#onModel', m)
    const rootElt = await m.ifcManager.getSpatialStructure(0, true)
    debug().log('CadView#onModel: rootElt: ', rootElt)
    if (rootElt.expressID === undefined) {
      throw new Error('Model has undefined root express ID')
    }
    setupLookupAndParentLinks(rootElt, elementsById)
    setDoubleClickListener()
    setKeydownListeners()
    initSearch(m, rootElt)
    const rootProps = await viewer.getProperties(0, rootElt.expressID)
    rootElt.Name = rootProps.Name
    rootElt.LongName = rootProps.LongName
    setRootElement(rootElt)
    setIsNavPanelOpen(true)
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
    setShowSearchBar(true)
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
      Privacy.recordEvent('search', {
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
    resetSelection()
    setCutPlaneDirections([])
    setLevelInstance(null)
  }

  /** Deselect active scene elts and remove clip planes. */
  function deselectItems() {
    if (viewer) {
      viewer.clipper.deleteAllPlanes()
    }
    resetState()
    const repoFilePath = modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath
    window.removeEventListener('beforeunload', handleBeforeUnload)
    navigate(`${pathPrefix}${repoFilePath}`)
  }

  /**
   * Pick the given items in the scene.
   *
   * @param {Array} resultIDs Array of expressIDs
   */
  function selectItemsInScene(resultIDs, updateNavigation = true) {
    // NOTE: we might want to compare with previous selection to avoid unnecessary updates
    if (!viewer) {
      return
    }
    try {
      // Update The Component state
      setSelectedElements(resultIDs.map((id) => `${id}`))

      // Sets the url to the last selected element path.
      if (resultIDs.length > 0 && updateNavigation) {
        const lastId = resultIDs.slice(-1)
        const pathIds = getPathIdsForElements(lastId)
        const repoFilePath = modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath
        const path = pathIds.join('/')
        const curHashParams = getAllHashParams()
        debug().log('CadView#selectItemsInScene: curHashParams: ', curHashParams)
        navigate(`${pathPrefix}${repoFilePath}/${path}#${curHashParams}`)
      }
    } catch (e) {
      // IFCjs will throw a big stack trace if there is not a visual
      // element, e.g. for IfcSite, but we still want to proceed to
      // setup its properties.
      debug().log('TODO: no visual element for item ids: ', resultIDs)
    }
  }


  /**
   * Returns the ids of path parts from root to this elt in spatial
   * structure.
   *
   * @param {number} expressId
   * @return {Array} pathIds
   */
  function getPathIdsForElements(expressId) {
    const lookupElt = elementsById[parseInt(expressId)]
    if (!lookupElt) {
      debug().error(`CadView#getPathIdsForElements(${expressId}) missing in table:`, elementsById)
      return undefined
    }
    const pathIds = computeElementPathIds(lookupElt, (elt) => elt.expressID)
    return pathIds
  }

  /**
   * Extracts the path to the element from the url and selects the element
   *
   * @param {string} filepath Part of the URL that is the file path, e.g. index.ifc/1/2/3/...
   */
  function selectElementBasedOnFilepath(filepath) {
    const parts = filepath.split(/\//)
    if (parts.length > 0) {
      debug().log('CadView#selectElementBasedOnUrlPath: have path', parts)
      const targetId = parseInt(parts[parts.length - 1])
      const selectedInViewer = viewer.getSelectedIds()
      if (isFinite(targetId) && !selectedInViewer.includes(targetId)) {
        selectItemsInScene([targetId], false)
      }
    }
  }

  /** Select items in model when they are double-clicked. */
  function setDoubleClickListener() {
    window.ondblclick = canvasDoubleClickHandler
  }

  /** Handle double click event on canvas. */
  async function canvasDoubleClickHandler(event) {
    if (!event.target || event.target.tagName !== 'CANVAS') {
      return
    }
    const item = await viewer.castRayToIfcScene()
    if (!item) {
      return
    }
    selectWithShiftClickEvents(event.shiftKey, item.id)
  }

  /**
   * Select/Deselect items in the scene using shift+click
   *
   * @param {boolean} shiftKey the click event
   * @param {number} expressId the express id of the element
   */
  function selectWithShiftClickEvents(shiftKey, expressId) {
    let newSelection = []
    if (!viewer.isolator.canBePickedInScene(expressId)) {
      return
    }
    if (shiftKey) {
      const selectedInViewer = viewer.getSelectedIds()
      const indexOfItem = selectedInViewer.indexOf(expressId)
      const alreadySelected = indexOfItem !== -1
      if (alreadySelected) {
        selectedInViewer.splice(indexOfItem, 1)
      } else {
        selectedInViewer.push(expressId)
      }
      newSelection = selectedInViewer
    } else {
      newSelection = [expressId]
    }
    selectItemsInScene(newSelection)
  }


  /** Set Keyboard button Shortcuts */
  function setKeydownListeners() {
    window.onkeydown = (event) => {
      // add a plane
      if (event.code === 'KeyQ') {
        viewer.clipper.createPlane()
      } else if (event.code === 'KeyW') {
        viewer.clipper.deletePlane()
      } else if (event.code === 'KeyA' ||
        event.code === 'Escape') {
        selectItemsInScene([])
      } else if (event.code === 'KeyH') {
        viewer.isolator.hideSelectedElements()
      } else if (event.code === 'KeyU') {
        viewer.isolator.unHideAllElements()
      } else if (event.code === 'KeyI') {
        viewer.isolator.toggleIsolationMode()
      } else if (event.code === 'KeyR') {
        viewer.isolator.toggleRevealHiddenElements()
      }
    }
  }


  const windowDimensions = useWindowDimensions()
  const spacingBetweenSearchAndOpsGroupPx = 20
  const operationsGroupWidthPx = 60
  const searchAndNavWidthPx = windowDimensions.width - (operationsGroupWidthPx + spacingBetweenSearchAndOpsGroupPx)
  const searchAndNavMaxWidthPx = 300
  return (
    <Box
      sx={{
        position: 'absolute',
        top: '0px',
        left: '0px',
        flex: 1,
        width: '100vw',
        height: '100vh',
      }}
      data-model-ready={modelReady}
    >
      <Box
        sx={{
          position: 'absolute',
          top: '0px',
          left: '0px',
          textAlign: 'center',
          width: '100vw',
          height: '100vh',
          margin: 'auto',
        }}
        id='viewer-container'
        onMouseDown={async (event) => {
          await onSceneSingleTap(event)
        }}
        {...onSceneDoubleTap}
      />
      <SnackBarMessage
        message={snackMessage ? snackMessage : loadingMessage}
        severity={'info'}
        open={isLoading || snackMessage !== null}
      />
      {showSearchBar && (
        <Box sx={{
          'position': 'absolute',
          'top': `1em`,
          'left': '1em',
          'display': 'flex',
          'flexDirection': 'column',
          'justifyContent': 'flex-start',
          'alignItems': 'flex-start',
          'maxHeight': '95%',
          'width': '275px',
          '@media (max-width: 900px)': {
            width: `${searchAndNavWidthPx}px`,
            maxWidth: `${searchAndNavMaxWidthPx}px`,
          },
        }}
        >
          {isSearchBarVisible &&
            <SearchBar
              fileOpen={loadLocalFile}
            />}
          {
            modelPath.repo !== undefined &&
            <BranchesControl location={location}/>
          }
          {isNavPanelOpen &&
            isNavigationPanelVisible &&
            <NavPanel
              model={model}
              element={rootElement}
              defaultExpandedElements={defaultExpandedElements}
              expandedElements={expandedElements}
              setExpandedElements={setExpandedElements}
              selectWithShiftClickEvents={selectWithShiftClickEvents}
              pathPrefix={
                pathPrefix + (modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath)
              }
            />
          }
        </Box>
      )}
      <Logo onClick={() => navToDefault(navigate, appPrefix)}/>
      {alert}
      {viewer && <OperationsGroupAndDrawer deselectItems={deselectItems}/>
      }
    </Box>
  )
}


/**
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
function OperationsGroupAndDrawer({deselectItems}) {
  const isMobile = useIsMobile()

  return (
    isMobile ? (
      <>
        {/* TODO(pablo): line 650 : CadView just has two sub-components the left and right group,
        and their first elements should be same height and offset so they line up naturally..
        this is a shim for the misalignment you see with tooltips without it */}
        <Box
          sx={{
            position: 'absolute',
            top: 3,
            right: 0,
          }}
        >
          <OperationsGroup deselectItems={deselectItems}/>
        </Box>
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            width: '100%',
          }}
        >
          <SideDrawer/>
        </Box>
      </>
    ) : (
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          display: 'flex',
          flex: 1,
          flexDirection: 'row',
        }}
      >
        <OperationsGroup deselectItems={deselectItems}/>
        <SideDrawer/>
      </Box>
    )
  )
}


/**
 * @param {string} pathPrefix E.g. /share/v/p
 * @param {string} backgroundColorStr CSS str like '#abcdef'
 * @return {object} IfcViewerAPIExtended viewer, width a .container property
 *     referencing its container.
 */
function initViewer(pathPrefix, backgroundColorStr = '#abcdef') {
  debug().log('CadView#initViewer: pathPrefix: ', pathPrefix, backgroundColorStr)
  const container = document.getElementById('viewer-container')

  // Clear any existing scene.
  container.textContent = ''
  const viewer = new IfcViewerAPIExtended({
    container,
    backgroundColor: new Color(backgroundColorStr),
  })
  debug().log('CadView#initViewer: viewer created:', viewer)

  // Path to web-ifc.wasm in serving directory.
  viewer.IFC.setWasmPath('./static/js/')
  viewer.clipper.active = true
  viewer.clipper.orthogonalY = false

  // Highlight items when hovering over them
  window.onmousemove = (event) => {
    viewer.highlightIfcItem()
  }

  viewer.container = container
  return viewer
}


const getGitHubDownloadURL = async (url, accessToken) => {
  const repo = parseGitHubRepositoryURL(url)
  const downloadURL = await getDownloadURL({orgName: repo.owner, name: repo.repository}, repo.path, repo.ref, accessToken)
  return downloadURL
}


const getFinalURL = async (url, accessToken) => {
  const u = new URL(url)

  switch (u.host.toLowerCase()) {
    case 'github.com':
      if (accessToken === '') {
        u.host = 'raw.githubusercontent.com'
        return u.toString()
      }

      return await getGitHubDownloadURL(url, accessToken)

    default:
      return url
  }
}


/**
 * @param {string} filepath
 * @return {string}
 */
export function getNewModelRealPath(filepath) {
  const l = window.location
  filepath = filepath.split('.ifc')[0]
  const parts = filepath.split('/')
  filepath = parts[parts.length - 1]
  filepath = `blob:${l.protocol}//${l.hostname + (l.port ? `:${l.port}` : '')}/${filepath}`
  return filepath
}
