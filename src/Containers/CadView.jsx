import React, {useEffect, useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {makeStyles} from '@mui/styles'
import {Color} from 'three'
import {IfcViewerAPI} from 'web-ifc-viewer'
import SearchIndex from './SearchIndex.js'
import ItemPanelButton from '../Components/ItemPanel'
import NavPanel from '../Components/NavPanel'
import SearchBar from '../Components/SearchBar'
import ToolBar from '../Components/ToolBar'
import IconGroup from '../Components/IconGroup'
import SnackBarMessage from '../Components/SnackbarMessage'
import gtag from '../utils/gtag'
import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'
import {computeElementPath, setupLookupAndParentLinks} from '../utils/TreeUtils'


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
  const [selectedElement, setSelectedElement] = useState({})
  const [selectedElements, setSelectedElements] = useState([])
  const [expandedElements, setExpandedElements] = useState([])

  // UI elts
  const classes = useStyles()
  const [showNavPanel, setShowNavPanel] = useState(false)
  const [showSearchBar, setShowSearchBar] = useState(false)
  // eslint-disable-next-line no-unused-vars
  const [showItemPanel, setShowItemPanel] = useState(false)
  const [showShortCuts, setShowShortCuts] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState()
  const [model, setModel] = useState(null)


  /** Load the full resolved model path. */
  useEffect(() => {
    debug().log('CadView#useEffect[modelPath], setting new viewer')
    setShowNavPanel(false)
    setShowSearchBar(false)
    setShowItemPanel(false)
    setViewer(initViewer(pathPrefix))
    debug().log('CadView#useEffect[modelPath], done setting new viewer')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelPath])


  useEffect(() => {
    if (viewer == null) {
      debug().warn('CadView#useEffect[viewer], viewer is null!')
      return
    }
    (async () => {
      debug().log('CadView#useEffect[viewer], calling loadIfc')
      const model = await loadIfc(modelPath.gitpath || (installPrefix + modelPath.filepath))
      setModel(model)
      debug().log('CadView#useEffect[viewer], done loading new ifc')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer])


  useEffect(() => {
    if (model == null) {
      return
    }
    (async () => {
      const newId = model.modelID
      // setModelId(newId)
      debug().log('CadView#useEffect[model]: model, viewer, newId', model, viewer, newId)
      const rootElt = await model.ifcManager.getSpatialStructure(0, true)
      onModelLoad(model, rootElt)
      setShowNavPanel(true)
      debug().log('CadView#useEffect[model]: done.  rootElt: ', rootElt)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])


  useEffect(() => {
    debug().log('CadView#useEffect[searchParams]')
    onSearch()
    debug().log('CadView#useEffect[searchParams]: done')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])


  /**
   * Load IFC helper used by 1) useEffect on path change and 2) upload button.
   * @param {string} filepath
   */
  async function loadIfc(filepath) {
    debug().log(`CadView#loadIfc: `, filepath, viewer)
    if (pathPrefix.endsWith('new')) {
      const l = window.location
      debug(3).log('CadView#loadIfc: parsing blob from url: ', l)
      filepath = filepath.split('.ifc')[0]
      const parts = filepath.split('/')
      filepath = parts[parts.length - 1]
      debug(3).log('CadView#loadIfc: got: ', filepath)
      filepath = `blob:${l.protocol}//${l.hostname + (l.port ? ':' + l.port : '')}/${filepath}`
    }
    const loadingMessageBase = `Loading ${filepath}`
    setLoadingMessage(loadingMessageBase)
    setIsLoading(true)
    const model = await viewer.IFC.loadIfcUrl(
        filepath,
        true, // fit to frame
        (progressEvent) => {
          if (Number.isFinite(progressEvent.loaded)) {
            const loadedBytes = progressEvent.loaded
            const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
            setLoadingMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
            debug(3).log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
          }
        },
        (error) => {
          console.error('CadView#loadIfc$onError', error)
          // TODO(pablo): error modal.
          setIsLoading(false)
        },
    )
    gtag('event', 'select_content', {
      content_type: 'ifc_model',
      item_id: filepath,
    })
    setIsLoading(false)

    // Fix for https://github.com/buildrs/Share/issues/91
    //
    // TODO(pablo): huge hack. Somehow this is getting incremented to
    // 1 even though we have a new IfcViewer instance for each file
    // load.  That modelID is used in the IFCjs code as [modelID] and
    // leads to undefined refs e.g. in prePickIfcItem.  The id should
    // always be 0.
    model.modelID = 0

    return model
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
   * @param {Object} m
   * @param {Object} rootElt Root of the IFC model.
   */
  function onModelLoad(m, rootElt) {
    debug().log('CadView#onModelLoad...', m, rootElt)
    if (rootElt.expressID == undefined) {
      throw new Error('Model has undefined root express ID')
    }
    setRootElement(rootElt)
    setupLookupAndParentLinks(rootElt, elementsById)
    setDoubleClickListener()
    initSearch(m, rootElt)
  }


  /**
   * @param {Object} m The IfcViewerAPI instance.
   * @param {Object} rootElt Root ifc elment for recursive indexing.
   */
  function initSearch(m, rootElt) {
    searchIndex.clearIndex()
    debug().log('CadView#initSearch: ', m, rootElt)
    debug().time('build searchIndex')
    searchIndex.indexElement(m, rootElt)
    debug().timeEnd('build searchIndex')
    debug().log('searchIndex: ', searchIndex)
    onSearch()
    setShowSearchBar(true)
  }


  /** Clear active search state and unpick active scene elts. */
  function clearSearch() {
    setSelectedElements([])
    if (viewer) {
      viewer.IFC.unpickIfcItems()
    }
  }


  /**
   * Search for the query in the index and select matching items in UI elts.
   * @param {string} query The search query.
   */
  function onSearch() {
    const sp = new URLSearchParams(window.location.search)
    let query = sp.get('q')
    if (query) {
      query = query.trim()
      if (query === '') {
        throw new Error('CadView#onSearch: empty query in search handler')
      }
      const resultIDs = searchIndex.search(query)
      selectItems(resultIDs)
      setDefaultExpandedElements(resultIDs.map((id) => id + ''))
      gtag('event', 'search', {
        search_term: query,
      })
    } else {
      clearSearch()
    }
  }


  /**
   * Select items in model when they are double-clicked.
   * @param {string} filepath
   */
  async function setDoubleClickListener() {
    window.ondblclick = async (event) => {
      if (event.target && event.target.tagName == 'CANVAS') {
        const item = await viewer.IFC.pickIfcItem(true)
        if (item.modelID === undefined || item.id === undefined) return
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


  /** Add a clipping plane. */
  function placeCutPlane() {
    viewer.clipper.createPlane()
  }


  /** Unpick active scene elts and remove clip planes. */
  function unSelectItems() {
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
    setShowItemPanel(false)

    // TODO(pablo): just found out this method is getting called a lot
    // when i added navigation on select, which flooded the browser
    // IPC.
    // console.log('CadView#onElementSelect: in...')
  }


  return (
    <div className={classes.pageContainer}>
      <div className={classes.viewWrapper}>
        <div className={classes.viewContainer} id='viewer-container'></div>
      </div>
      <div className={classes.menusWrapper}>
        <ToolBar
          fileOpen={loadLocalFile}
          offsetTop={PANEL_TOP}/>
        <SnackBarMessage
          message={loadingMessage}
          type={'info'}
          open={isLoading}
        />
        <div className={classes.searchContainer}>
          {showSearchBar && (
            <SearchBar
              onClickMenuCb={() => setShowNavPanel(!showNavPanel)}
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
            onElementSelect={onElementSelect}
            setExpandedElements={setExpandedElements}
            pathPrefix={
              pathPrefix + (modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath)
            }
          />}
        <div className={classes.itemPanelContainer}>
          <ItemPanelButton
            model={model}
            element={selectedElement}
            close={()=>setShowItemPanel(false)}
            topOffset={PANEL_TOP}
            placeCutPlane={()=>placeCutPlane()}
            unSelectItem={()=>unSelectItems()}
            toggleShortCutsPanel={()=>setShowShortCuts(!showShortCuts)}/>
        </div>
        <div className={classes.iconGroup}>
          <IconGroup
            placeCutPlane={()=>placeCutPlane()}
            unSelectItem={()=>unSelectItems()}
            toggleShortCutsPanel={()=>setShowShortCuts(!showShortCuts)}
          />
        </div>
      </div>
    </div>
  )
}


/**
 * @param {string} pathPrefix e.g. /share/v/p
 * @return {Object} IfcViewerAPI viewer
 */
function initViewer(pathPrefix) {
  debug().log('CadView#initViewer: pathPrefix: ', pathPrefix)
  const container = document.getElementById('viewer-container')
  // Clear any existing scene.
  container.textContent = ''
  const v = new IfcViewerAPI({
    container,
    backgroundColor: new Color('#a0a0a0'),
  })
  debug().log('CadView#initViewer: viewer created: ', v)
  // Path to web-ifc.wasm in serving directory.
  v.IFC.setWasmPath('./static/js/')
  v.addAxes()
  v.addGrid(50, 50)
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


const PANEL_TOP = 84
const useStyles = makeStyles((theme) => ({
  pageContainer: {
    position: 'absolute',
    top: '0px',
    left: '0px',
    width: '100%',
    height: '100%',
  },
  viewerContainer: {
    zIndex: 0,
  },
  toolBar: {
    zIndex: 100,
  },
  menuToolbarContainer: {
    'width': '100%',
    'display': 'flex',
    'justifyContent': 'flex-end',
    'marginTop': '10px',
    'border': '1px solid red',
    '@media (max-width: 900px)': {
      marginTop: '40px',
    },
  },
  searchContainer: {
    position: 'absolute',
    top: `${PANEL_TOP}px`,
    left: '23px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  viewContainer: {
    position: 'absolute',
    top: '0px',
    left: '0px',
    textAlign: 'center',
    color: 'blue',
    width: '100vw',
    height: '100vh',
    margin: 'auto',
  },
  viewWrapper: {
    zIndex: 0,
  },
  menusWrapper: {
    zIndex: 100,
  },
  aboutPanelContainer: {
    position: 'absolute',
    top: `${PANEL_TOP}px`,
    left: '0px',
    right: '0px',
    minWidth: '200px',
    maxWidth: '500px',
    width: '100%',
    margin: '0em auto',
    border: 'none',
    zIndex: 1000,
  },
  shortCutPanelContainer: {
    position: 'absolute',
    top: `${PANEL_TOP}px`,
    left: '0px',
    right: '0px',
    minWidth: '200px',
    maxWidth: '500px',
    width: '100%',
    margin: '0em auto',
    border: 'none',
    zIndex: 1000,
  },
  iconGroup: {
    'position': 'absolute',
    'bottom': `40px`,
    'right': '20px',
    'border': 'none',
    'zIndex': 1000,
    '@media (max-width: 900px)': {
      bottom: `0px`,
      top: '140px',
      right: '14px',
    },
  },
}))
