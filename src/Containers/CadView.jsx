import React, {useContext, useEffect, useState} from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'
import {Color} from 'three'
import {IfcViewerAPI} from 'web-ifc-viewer'
import {makeStyles} from '@mui/styles'
import SearchIndex from './SearchIndex'
import {navToDefault} from '../Share'
import Alert from '../Components/Alert'
import BaseGroup from '../Components/BaseGroup'
import Logo from '../Components/Logo'
import NavPanel from '../Components/NavPanel'
import OperationsGroup from '../Components/OperationsGroup'
import SearchBar from '../Components/SearchBar'
import SideDrawerWrapper, {SIDE_DRAWER_WIDTH} from '../Components/SideDrawer'
import SnackBarMessage from '../Components/SnackbarMessage'
import {useIsMobile} from '../Components/Hooks'
import {hasValidUrlParams as urlHasCameraParams} from '../Components/CameraControl'
import {ColorModeContext} from '../Context/ColorMode'
import * as Privacy from '../privacy/Privacy'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'
import {computeElementPathIds, setupLookupAndParentLinks} from '../utils/TreeUtils'


/**
 * Experimenting with a global. Just calling #indexElement and #clear
 * when new models load.
 */
const searchIndex = new SearchIndex()


let count = 0
/**
 * Only container for the for the app.  Hosts the IfcViewer as well as
 * nav components.
 * @return {Object}
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
  const [selectedElements, setSelectedElements] = useState([])
  const [expandedElements, setExpandedElements] = useState([])

  // UI elts
  const colorModeContext = useContext(ColorModeContext)
  const classes = useStyles()
  const [showNavPanel, setShowNavPanel] = useState(false)
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [alert, setAlert] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState()
  const [model, setModel] = useState(null)
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)


  const setModelStore = useStore((state) => state.setModelStore)
  const setSelectedElement = useStore((state) => state.setSelectedElement)

  const setViewerStore = useStore((state) => state.setViewerStore)
  const snackMessage = useStore((state) => state.snackMessage)


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
  const location = useLocation()
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
    setShowNavPanel(false)
    setShowSearchBar(false)
    const theme = colorModeContext.getTheme()
    const initializedViewer = initViewer(
        pathPrefix,
        (theme &&
         theme.palette &&
         theme.palette.background &&
         theme.palette.background.paper) || '0xabcdef')
    setViewer(initializedViewer)
    setViewerStore(initializedViewer)
  }


  /** When viewer is ready, load IFC model. */
  async function onViewer() {
    if (viewer === null) {
      debug().warn('CadView#onViewer, viewer is null')
      return
    }
    addThemeListener()
    const pathToLoad = modelPath.gitpath || (installPrefix + modelPath.filepath)
    const tmpModelRef = await loadIfc(pathToLoad)
    await onModel(tmpModelRef)
    selectElementBasedOnFilepath(pathToLoad)
  }


  const isMobile = useIsMobile()
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
    setAlert(<Alert onCloseCb={() => navToDefault(navigate, appPrefix)} message={msg}/>)

  /**
   * Load IFC helper used by 1) useEffect on path change and 2) upload button.
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
      filepath = `blob:${l.protocol}//${l.hostname + (l.port ? `:${ l.port}` : '')}/${filepath}`
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
          setAlertMessage(`Could not load file: ${ filepath}`)
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
    const viewerContainer = document.getElementById('viewer-container')
    const fileInput = document.createElement('input')
    fileInput.setAttribute('type', 'file')
    fileInput.classList.add('file-input')
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
    viewerContainer.appendChild(fileInput)
    fileInput.click()
  }


  /**
   * Analyze loaded IFC model to configure UI elements.
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
    // console.log('setupLookupAndParentLinks', rootElt, elementsById, rootProps)
    rootElt.Name = rootProps.Name
    rootElt.LongName = rootProps.LongName
    setRootElement(rootElt)
    setShowNavPanel(true)
  }


  /**
   * Index the model starting at the given rootElt, clearing any
   * previous index data and parses any incoming search params in the
   * URL.  Enables search bar when done.
   * @param {Object} m The IfcViewerAPI instance.
   * @param {Object} rootElt Root ifc element for recursive indexing.
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
      setDefaultExpandedElements(resultIDs.map((id) => `${id }`))
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


  /** Unpick active scene elts and remove clip planes. */
  function unSelectItems() {
    setSelectedElement({})
    viewer.IFC.unpickIfcItems()
    viewer.clipper.deleteAllPlanes()
  }


  /**
   * Pick the given items in the scene.
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
   * @param {number} expressId
   * @return {array} pathIds
   */
  async function onElementSelect(expressId) {
    const lookupElt = elementsById[parseInt(expressId)]
    if (!lookupElt) {
      console.error(`CadView#onElementSelect(${expressId}) missing in table:`, elementsById)
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
    colorModeContext.addThemeChangeListener((newMode, theme) => {
      if (theme && theme.palette && theme.palette.background && theme.palette.background.paper) {
        const intializedViewer = initViewer(pathPrefix, theme.palette.background.paper)
        setViewer(intializedViewer)
        setViewerStore(intializedViewer)
      }
    })
  }


  return (
    <div className={classes.root}>
      <div className={classes.view} id='viewer-container'></div>
      <div className={classes.menusWrapper}>
        <SnackBarMessage
          message={snackMessage ? snackMessage : loadingMessage}
          type={'info'}
          open={isLoading || snackMessage !== null}
        />
        <div className={classes.search}>
          {showSearchBar && (
            <SearchBar
              onClickMenuCb={() => setShowNavPanel(!showNavPanel)}
              showNavPanel={showNavPanel}
              isOpen={showNavPanel}
            />
          )}
        </div>
        {showNavPanel &&
          <NavPanel
            model={model}
            element={rootElement}
            selectedElements={selectedElements}
            defaultExpandedElements={defaultExpandedElements}
            expandedElements={expandedElements}
            setExpandedElements={setExpandedElements}
            pathPrefix={
              pathPrefix + (modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath)
            }
          />}
        <Logo onClick={() => navToDefault(navigate, appPrefix)}/>
        <div className={isDrawerOpen ?
                        classes.operationsGroupOpen :
                        classes.operationsGroup}
        >
          {viewer &&
            <OperationsGroup
              viewer={viewer}
              unSelectItem={unSelectItems}
            />}
        </div>
        <div className={isDrawerOpen ? classes.baseGroupOpen : classes.baseGroup}>
          <BaseGroup installPrefix={installPrefix} fileOpen={loadLocalFile}/>
        </div>
        {alert}
      </div>
      <SideDrawerWrapper />
    </div>
  )
}


/**
 * @param {string} pathPrefix E.g. /share/v/p
 * @param {string} backgroundColorStr CSS str like '#abcdef'
 * @return {Object} IfcViewerAPI viewer, width a .container property
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


const useStyles = makeStyles({
  root: {
    'position': 'absolute',
    'top': '0px',
    'left': '0px',
    'minWidth': '100vw',
    'minHeight': '100vh',
    '@media (max-width: 900px)': {
      height: ' calc(100vh - calc(100vh - 100%))',
      minHeight: '-webkit-fill-available',
    },

  },
  search: {
    position: 'absolute',
    // TODO(pablo): we were passing this around as it's used in a few
    // places, but there's now only 1 dialog object that also uses it
    // and it has multiple callers; passing that variable around seems
    // overkill. I don't like not having it as a variable, but going
    // to hardcode for now and look into passing via the theme later.
    top: `20px`,
    left: '20px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  view: {
    position: 'absolute',
    top: '0px',
    left: '0px',
    textAlign: 'center',
    width: '100vw',
    height: '100vh',
    margin: 'auto',
  },
  operationsGroup: {
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
  },
  operationsGroupOpen: {
    'position': 'fixed',
    'top': 0,
    'right': '30em',
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
  },
  baseGroup: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
  },
  baseGroupOpen: {
    'position': 'fixed',
    'bottom': '20px',
    'right': '31em',
    '@media (max-width: 900px)': {
      display: 'none',
    },
  },
})
