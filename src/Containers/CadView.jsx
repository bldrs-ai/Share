import React, {useContext, useEffect, useState} from 'react'
import {Color, MeshLambertMaterial} from 'three'
import {IfcViewerAPI} from 'web-ifc-viewer'
import {useNavigate, useSearchParams, useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import * as Privacy from '../privacy/Privacy'
import Alert from '../Components/Alert'
import debug from '../utils/debug'
import Logo from '../Components/Logo'
import NavPanel from '../Components/NavPanel'
import OperationsGroup from '../Components/OperationsGroup'
import useStore from '../store/useStore'
import SearchBar from '../Components/SearchBar'
import SideDrawerWrapper, {SIDE_DRAWER_WIDTH} from '../Components/SideDrawer/SideDrawer'
import SnackBarMessage from '../Components/SnackbarMessage'
import {assertDefined} from '../utils/assert'
import {computeElementPathIds, setupLookupAndParentLinks} from '../utils/TreeUtils'
import {ColorModeContext} from '../Context/ColorMode'
import {navToDefault} from '../Share'
import {hasValidUrlParams as urlHasCameraParams} from '../Components/CameraControl'
import {useIsMobile} from '../Components/Hooks'
import SearchIndex from './SearchIndex'
import BranchesControl from '../Components/BranchesControl'


/**
 * Experimenting with a global. Just calling #indexElement and #clear
 * when new models load.
 */
const searchIndex = new SearchIndex()
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
  const [viewer, setViewer] = useState(null)
  const [rootElement, setRootElement] = useState({})
  const [elementsById] = useState({})
  const [defaultExpandedElements, setDefaultExpandedElements] = useState([])
  const [expandedElements, setExpandedElements] = useState([])

  // UI elts
  const colorMode = useContext(ColorModeContext)
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [alert, setAlert] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState()
  const [model, setModel] = useState(null)
  const isNavPanelOpen = useStore((state) => state.isNavPanelOpen)
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const setCutPlaneDirection = useStore((state) => state.setCutPlaneDirection)
  const setIsNavPanelOpen = useStore((state) => state.setIsNavPanelOpen)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const setModelStore = useStore((state) => state.setModelStore)
  const setSelectedElement = useStore((state) => state.setSelectedElement)
  const setSelectedElements = useStore((state) => state.setSelectedElements)
  const setViewerStore = useStore((state) => state.setViewerStore)
  const snackMessage = useStore((state) => state.snackMessage)
  const [modelReady, setModelReady] = useState(false)
  const isMobile = useIsMobile()
  const location = useLocation()


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


  // Watch for path changes within the model.
  // TODO(pablo): would be nice to have more consistent handling of path parsing.
  useEffect(() => {
    if (model) {
      (async () => {
        const parts = location.pathname.split(/\.ifc/i)
        const expectedPartCount = 2
        if (parts.length === expectedPartCount) {
          await selectElementBasedOnFilepath(parts[1])
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
    resetState()
    setIsNavPanelOpen(false)
    setShowSearchBar(false)
    const theme = colorMode.getTheme()
    const initializedViewer = initViewer(
        pathPrefix,
        (theme &&
        theme.palette &&
        theme.palette.background &&
        theme.palette.background.paper) || '0xabcdef')
    setViewer(initializedViewer)
    setViewerStore(initializedViewer)
    setSelectedElement(null)
  }


  /** When viewer is ready, load IFC model. */
  async function onViewer() {
    const theme = colorMode.getTheme()
    if (viewer === null) {
      debug().warn('CadView#onViewer, viewer is null')
      return
    }

    setModelReady(false)

    // define mesh colors for selected and preselected element
    const preselectMat = new MeshLambertMaterial({
      transparent: true,
      opacity: 0.5,
      color: theme.palette.highlight.secondary,
      depthTest: true,
    })
    const selectMat = new MeshLambertMaterial({
      transparent: true,
      color: theme.palette.highlight.main,
      depthTest: true,
    })

    if (viewer.IFC.selector) {
      viewer.IFC.selector.preselection.material = preselectMat
      viewer.IFC.selector.selection.material = selectMat
    }

    addThemeListener()
    const pathToLoad = modelPath.gitpath || (installPrefix + modelPath.filepath)
    const tmpModelRef = await loadIfc(pathToLoad)
    await onModel(tmpModelRef)
    selectElementBasedOnFilepath(pathToLoad)
    setModelReady(true)
  }


  // Shrink the scene viewer when drawer is open.  This recenters the
  // view in the new shrunk canvas, which preserves what the user is
  // looking at.
  // TODO(pablo): add render testing
  useEffect(() => {
    if (viewer && !isMobile) {
      viewer.container.style.width = isDrawerOpen ? `calc(100% - ${SIDE_DRAWER_WIDTH})` : '100%'
      viewer.context.resize()
    }
  }, [isDrawerOpen, isMobile, viewer])


  const setAlertMessage = (msg) =>
    setAlert(
        <Alert onCloseCb={() => {
          window.removeEventListener('beforeunload', handleBeforeUnload)
          navToDefault(navigate, appPrefix)
        }} message={msg}
        />,
    )

  /**
   * Prevent reloading page without user approval when loading a model from local
   *
   * @param {Event} e
   * @return {string} confirmationMessage
   */
  function handleBeforeUnload(e) {
    const confirmationMessage = 'Uploaded models are not saved. If you leave this page you will need to upload the model again.';
    (e || window.event).returnValue = confirmationMessage // Gecko + IE
    return confirmationMessage // Gecko + Webkit, Safari, Chrome etc.
  }

  /**
   * Load IFC helper used by 1) useEffect on path change and 2) upload button.
   *
   * @param {string} filepath
   */
  async function loadIfc(filepath) {
    debug().log(`CadView#loadIfc: `, filepath)

    if (pathPrefix.endsWith('new')) {
      const l = window.location
      filepath = filepath.split('.ifc')[0]
      const parts = filepath.split('/')
      filepath = parts[parts.length - 1]
      debug().log('CadView#loadIfc: parsed blob: ', filepath)
      filepath = `blob:${l.protocol}//${l.hostname + (l.port ? `:${l.port}` : '')}/${filepath}`
      window.addEventListener('beforeunload', handleBeforeUnload)
    }

    const loadingMessageBase = `Loading ${filepath}`
    setLoadingMessage(loadingMessageBase)
    setIsLoading(true)

    const loadedModel = await viewer.IFC.loadIfcUrl(
        filepath,
        !urlHasCameraParams(), // fitToFrame
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
          console.warn('CadView#loadIfc$onError', error)
          // TODO(pablo): error modal.
          setIsLoading(false)
          setAlertMessage(`Could not load file: ${filepath}`)
        })

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
  }


  /** Upload a local IFC file for display. */
  function loadLocalFile() {
    const fileInput = document.getElementById('file_input')
    fileInput.addEventListener(
        'change',
        (event) => {
          let ifcUrl = URL.createObjectURL(event.target.files[0])
          const parts = ifcUrl.split('/')
          ifcUrl = parts[parts.length - 1]
          navigate(`${appPrefix}/v/new/${ifcUrl}.ifc`)
        },
        false,
    )
    fileInput.click()
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
    if (rootElt.expressID === undefined) {
      throw new Error('Model has undefined root express ID')
    }
    setupLookupAndParentLinks(rootElt, elementsById)
    setDoubleClickListener()
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
   * @param {object} m The IfcViewerAPI instance.
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
      selectItemsInScene(resultIDs)
      setDefaultExpandedElements(resultIDs.map((id) => `${id}`))
      Privacy.recordEvent('search', {
        search_term: query,
      })
    } else {
      clearSearch()
    }
  }


  /** Clear active search state and unpick active scene elts. */
  function clearSearch() {
    setSelectedElements([])
    if (viewer) {
      viewer.IFC.unpickIfcItems()
    }
  }

  /** Reset global state */
  function resetState() {
    setSelectedElement(null)
    setSelectedElements(null)
    setCutPlaneDirection(null)
    setLevelInstance(null)
  }


  /** Unpick active scene elts and remove clip planes. */
  function unSelectItems() {
    viewer.IFC.unpickIfcItems()
    viewer.clipper.deleteAllPlanes()
    resetState()
    const repoFilePath = modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath
    navigate(`${pathPrefix}${repoFilePath}`)
  }


  /**
   * Pick the given items in the scene.
   *
   * @param {Array} resultIDs Array of expressIDs
   */
  async function selectItemsInScene(resultIDs) {
    setSelectedElements(resultIDs.map((id) => `${id}`))
    try {
      await viewer.pickIfcItemsByID(0, resultIDs, true)
    } catch (e) {
      // IFCjs will throw a big stack trace if there is not a visual
      // element, e.g. for IfcSite, but we still want to proceed to
      // setup its properties.
      debug().log('TODO: no visual element for item ids: ', resultIDs)
    }
  }


  /**
   * Select the items in the NavTree and update ItemProperties.
   * Returns the ids of path parts from root to this elt in spatial
   * structure.
   *
   * @param {number} expressId
   * @return {Array} pathIds
   */
  async function onElementSelect(expressId) {
    const lookupElt = elementsById[parseInt(expressId)]
    if (!lookupElt) {
      debug().error(`CadView#onElementSelect(${expressId}) missing in table:`, elementsById)
      return
    }
    await selectItemsInScene([expressId])
    const pathIds = computeElementPathIds(lookupElt, (elt) => elt.expressID)
    setExpandedElements(pathIds.map((n) => `${n}`))
    setSelectedElements(`${expressId}`)
    const props = await viewer.getProperties(0, expressId)
    setSelectedElement(props)
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
      if (isFinite(targetId)) {
        onElementSelect(targetId)
      }
    }
  }


  /** Select items in model when they are double-clicked. */
  function setDoubleClickListener() {
    window.ondblclick = async (event) => {
      if (event.target && event.target.tagName === 'CANVAS') {
        const item = await viewer.IFC.pickIfcItem(true)
        if (item && Number.isFinite(item.modelID) && Number.isFinite(item.id)) {
          const pathIds = await onElementSelect(item.id)
          const repoFilePath = modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath
          const path = pathIds.join('/')
          navigate(`${pathPrefix}${repoFilePath}/${path}`)
        }
      }
    }
  }


  const addThemeListener = () => {
    colorMode.addThemeChangeListener((newMode, theme) => {
      if (theme && theme.palette && theme.palette.background && theme.palette.background.paper) {
        const intializedViewer = initViewer(pathPrefix, theme.palette.background.paper)
        setViewer(intializedViewer)
        setViewerStore(intializedViewer)
      }
    })
  }


  return (
    <Box
      sx={{
        'position': 'absolute',
        'top': '0px',
        'left': '0px',
        'minWidth': '100vw',
        'minHeight': '100vh',
        '@media (max-width: 900px)': {
          height: ' calc(100vh - calc(100vh - 100%))',
          minHeight: '-webkit-fill-available',
        },
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
      />
      <>
        <SnackBarMessage
          message={snackMessage ? snackMessage : loadingMessage}
          type={'info'}
          open={isLoading || snackMessage !== null}
        />
        {showSearchBar && (
          <Box sx={{
            position: 'absolute',
            top: `30px`,
            left: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            maxHeight: '95%',
          }}
          >
            <SearchBar
              fileOpen={loadLocalFile}
            />
            {
              modelPath.repo !== undefined &&
              <BranchesControl location={location}/>
            }
            {isNavPanelOpen &&
              <NavPanel
                model={model}
                element={rootElement}
                defaultExpandedElements={defaultExpandedElements}
                expandedElements={expandedElements}
                setExpandedElements={setExpandedElements}
                pathPrefix={
                  pathPrefix + (modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath)
                }
              />
            }
          </Box>
        )}

        <Logo onClick={() => navToDefault(navigate, appPrefix)}/>
        <Box sx={isDrawerOpen ? {
          'position': 'fixed',
          'top': 0,
          'right': '31em',
          'border': 'none',
          'zIndex': 0,
          '@media (max-width: 900px)': {
            right: 0,
            height: '50%',
          },
          '@media (max-width: 350px)': {
            top: '120px',
            height: '50%',
          },
        } : {
          'position': 'fixed',
          'top': 0,
          'right': 0,
          'border': 'none',
          'zIndex': 0,
          '@media (max-width: 900px)': {
            right: 0,
            height: '50%',
          },
          '@media (max-width: 350px)': {
            top: '75px',
            height: '50%',
          },
        }}
        >
          {viewer &&
            <OperationsGroup
              unSelectItem={unSelectItems}
            />}
        </Box>
        {alert}
      </>
      <SideDrawerWrapper/>
      <input type='file' id='file_input' data-testid='file_input' style={{display: 'none'}}/>
    </Box>
  )
}


/**
 * @param {string} pathPrefix E.g. /share/v/p
 * @param {string} backgroundColorStr CSS str like '#abcdef'
 * @return {object} IfcViewerAPI viewer, width a .container property
 *     referencing its container.
 */
function initViewer(pathPrefix, backgroundColorStr = '#abcdef') {
  debug().log('CadView#initViewer: pathPrefix: ', pathPrefix, backgroundColorStr)
  const container = document.getElementById('viewer-container')

  // Clear any existing scene.
  container.textContent = ''
  const v = new IfcViewerAPI({
    container,
    backgroundColor: new Color(backgroundColorStr),
  })
  debug().log('CadView#initViewer: viewer created:', v)

  // Path to web-ifc.wasm in serving directory.
  v.IFC.setWasmPath('./static/js/')
  v.clipper.active = true
  v.clipper.orthogonalY = false

  // Highlight items when hovering over them
  window.onmousemove = (event) => {
    v.prePickIfcItem()
  }

  window.onkeydown = (event) => {
    // add a plane
    if (event.code === 'KeyQ') {
      v.clipper.createPlane()
    }
    // delete all planes
    if (event.code === 'KeyW') {
      v.clipper.deletePlane()
    }
    if (event.code === 'KeyA') {
      v.IFC.unpickIfcItems()
    }
  }

  // window.addEventListener('resize', () => {v.context.resize()})

  v.container = container
  return v
}
