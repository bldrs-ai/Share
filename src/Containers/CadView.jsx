import React, {useContext, useEffect, useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {Color} from 'three'
import {IfcViewerAPI} from 'web-ifc-viewer'
import {useAuth0} from '@auth0/auth0-react'
import {makeStyles} from '@mui/styles'
import {ColorModeContext} from '../Context/ColorMode'
import Alert from '../Components/Alert'
import BaseGroup from '../Components/BaseGroup'
import Logo from '../Components/Logo'
import NavPanel from '../Components/NavPanel'
import OperationsGroup from '../Components/OperationsGroup'
import SearchBar from '../Components/SearchBar'
import SideDrawerWrapper from '../Components/SideDrawer'
import SnackBarMessage from '../Components/SnackbarMessage'
import {hasValidUrlParams as urlHasCameraParams} from '../Components/CameraControl'
import {navToDefault} from '../Share'
import * as Privacy from '../privacy/Privacy'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'
import {computeElementPath, setupLookupAndParentLinks} from '../utils/TreeUtils'
import SearchIndex from './SearchIndex.js'


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
  const elementsById = useState({})
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
  const auth0 = useAuth0()


  /* eslint-disable react-hooks/exhaustive-deps */
  // ModelPath changes in parent (ShareRoutes) from user and
  // programmatic navigation (e.g. clicking element links).
  useEffect(() => {
    onModelPath()
  }, [modelPath])


  // Viewer changes in onModelPath (above)
  useEffect(() => {
    (async () => {
      await onViewer()
    })()
  }, [viewer])

  // Model changes in onViewer (above)
  useEffect(() => {
    (async () => {
      await onModel()
    })()
  }, [model])

  // searchParams changes in parent (ShareRoutes) from user and
  // programmatic navigation, and in SearchBar.
  useEffect(() => {
    onSearchParams()
  }, [searchParams])
  /* eslint-enable */


  /**
   * Begin setup for new model. Turn off nav, search and item and init
   * new viewer.
   */
  function onModelPath() {
    setShowNavPanel(false)
    setShowSearchBar(false)
    const theme = colorModeContext.getTheme()
    const intializedViewer = initViewer(
        pathPrefix,
        (theme &&
        theme.palette &&
        theme.palette.background &&
        theme.palette.background.paper) || '0xabcdef')
    setViewer(intializedViewer)
    setViewerStore(intializedViewer)
    debug().log('CadView#onModelPath, done setting new viewer')
  }


  /** When viewer is ready, load IFC model. */
  async function onViewer() {
    if (viewer == null) {
      debug().warn('CadView#onViewer, viewer is null')
      return
    }
    addThemeListener()
    await loadIfc(modelPath.gitpath || (installPrefix + modelPath.filepath))
  }

  const setAlertMessage = (msg) =>
    setAlert(<Alert onCloseCb={() => navToDefault(navigate, appPrefix)} message={msg}/>)

  /**
   * Load IFC helper used by 1) useEffect on path change and 2) upload button.
   * @param {string} filepath
   */
  async function loadIfc(filepath) {
    debug().log(`CadView#loadIfc: `, filepath, viewer)
    if (pathPrefix.endsWith('new')) {
      const l = window.location
      filepath = filepath.split('.ifc')[0]
      const parts = filepath.split('/')
      filepath = parts[parts.length - 1]
      debug(3).log('CadView#loadIfc: parsed blob: ', filepath)
      filepath = `blob:${l.protocol}//${l.hostname + (l.port ? ':' + l.port : '')}/${filepath}`
    }
    const loadingMessageBase = `Loading ${filepath}`
    setLoadingMessage(loadingMessageBase)
    setIsLoading(true)
    const accessToken = await auth0.getAccessTokenSilently()
    if (accessToken) {
      viewer.IFC.loader.requestHeader = {
        Authorization: `Bearer ${accessToken}`,
      }
    }


    const model = await viewer.IFC.loadIfcUrl(
        filepath,
        urlHasCameraParams() ? false : true, // fitToFrame
        (progressEvent) => {
          if (Number.isFinite(progressEvent.loaded)) {
            const loadedBytes = progressEvent.loaded
            const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
            setLoadingMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
            debug(3).log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
          }
        },
        (error) => {
          console.warn('CadView#loadIfc$onError', error)
          // TODO(pablo): error modal.
          setIsLoading(false)
          setAlertMessage('Could not load file: ' + filepath)
        })
    Privacy.recordEvent('select_content', {
      content_type: 'ifc_model',
      item_id: filepath,
    })
    setIsLoading(false)

    if (model) {
      // Fix for https://github.com/bldrs-ai/Share/issues/91
      //
      // TODO(pablo): huge hack. Somehow this is getting incremented to
      // 1 even though we have a new IfcViewer instance for each file
      // load.  That modelID is used in the IFCjs code as [modelID] and
      // leads to undefined refs e.g. in prePickIfcItem.  The id should
      // always be 0.
      model.modelID = 0
      setModel(model)
      setModelStore(model)
    }
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


  /** Analyze loaded IFC model to configure UI elements. */
  async function onModel() {
    if (model == null) {
      return
    }
    const rootElt = await model.ifcManager.getSpatialStructure(0, true)
    if (rootElt.expressID == undefined) {
      throw new Error('Model has undefined root express ID')
    }
    setupLookupAndParentLinks(rootElt, elementsById)
    setDoubleClickListener()
    initSearch(model, rootElt)
    // The spatial structure doesn't contain properties.  NavTree uses
    // the callback for onElementSelect in this class to fill out
    // details for the rest of the tree items, so just root needs
    // special handling.
    // TODO(pablo): not sure if this is expected or a problem with the
    // IFC API.  Could also try to get the initial root elt load to
    // use shared logic with setSelectedElement.
    const rootProps = await viewer.getProperties(0, rootElt.expressID)
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
      selectItems(resultIDs)
      setDefaultExpandedElements(resultIDs.map((id) => id + ''))
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


  /**
   * Select items in model when they are double-clicked.
   */
  async function setDoubleClickListener() {
    window.ondblclick = async (event) => {
      if (event.target && event.target.tagName == 'CANVAS') {
        const item = await viewer.IFC.pickIfcItem(true)
        if (item && Number.isFinite(item.modelID) && Number.isFinite(item.id)) {
          const path = computeElementPath(elementsById[item.id], (elt) => elt.expressID)
          if (modelPath.gitpath) {
            navigate(pathPrefix + modelPath.getRepoPath() + path)
          } else {
            navigate(pathPrefix + modelPath.filepath + path)
          }
          setSelectedElement(item)
        }
      }
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
  async function selectItems(resultIDs) {
    setSelectedElements(resultIDs.map((id) => id + ''))
    try {
      await viewer.pickIfcItemsByID(0, resultIDs, true)
    } catch (e) {
      // IFCjs will throw a big stack trace if there is not a visual
      // element, e.g. for IfcSite, but we still want to proceed to
      // setup its properties.
      debug(3).log('TODO: no visual element for item ids: ', resultIDs)
    }
  }


  /**
   * Select the items in the NavTree and update item properties for ItemPanel.
   * @param {Object} elt The selected IFC element.
   */
  async function onElementSelect(elt) {
    const id = elt.expressID
    if (id === undefined) {
      throw new Error('Selected element is missing Express ID')
    }
    selectItems([id])
    const props = await viewer.getProperties(0, elt.expressID)
    setSelectedElement(props)

    // TODO(pablo): just found out this method is getting called a lot
    // when i added navigation on select, which flooded the browser
    // IPC.
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
          open={isLoading || snackMessage !== null}/>
        <div className={classes.search}>
          {showSearchBar && (
            <SearchBar
              onClickMenuCb={() => setShowNavPanel(!showNavPanel)}
              showNavPanel={showNavPanel}
              isOpen={showNavPanel}/>
          )}
        </div>
        {showNavPanel &&
          <NavPanel
            model={model}
            element={rootElement}
            selectedElements={selectedElements}
            defaultExpandedElements={defaultExpandedElements}
            expandedElements={expandedElements}
            onElementSelect={onElementSelect}
            setExpandedElements={setExpandedElements}
            pathPrefix={
              pathPrefix + (modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath)
            }/>}
        <Logo onClick={() => navToDefault(navigate, appPrefix)}/>
        <div className={isDrawerOpen ?
                        classes.operationsGroupOpen :
                        classes.operationsGroup}>
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
 * @param {string} pathPrefix e.g. /share/v/p
 * @param {string} backgroundColorStr CSS str like '#abcdef'
 * @return {Object} IfcViewerAPI viewer
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
  debug().log('CadView#initViewer: viewer created: ', v)
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
    if (event.code == 'KeyA') {
      v.IFC.unpickIfcItems()
    }
  }

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
    'right': '308px',
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
    'right': '326px',
    '@media (max-width: 900px)': {
      display: 'none',
    },
  },
})
