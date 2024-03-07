import React, {useEffect, useContext, useState} from 'react'
import {useNavigate, useSearchParams, useLocation} from 'react-router-dom'
import {Color, MeshLambertMaterial} from 'three'
import {useAuth0} from '@auth0/auth0-react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import AboutControl from '../Components/About/AboutControl'
import Alert from '../Components/Alert'
import AppStoreSideDrawer from '../Components/AppStore/AppStoreSideDrawerControl'
import {hasValidUrlParams as urlHasCameraParams} from '../Components/CameraControl'
import ControlsGroup from '../Components/ControlsGroup'
import ElementGroup from '../Components/ElementGroup'
import HelpControl from '../Components/HelpControl'
import {useWindowDimensions, useIsMobile} from '../Components/Hooks'
import NavPanel from '../Components/NavPanel'
import OperationsGroup from '../Components/OperationsGroup'
import SearchBar from '../Components/SearchBar'
import SideDrawer from '../Components/SideDrawer/SideDrawer'
import SnackBarMessage from '../Components/SnackbarMessage'
import VersionsContainer from '../Components/Versions/VersionsContainer'
import {IfcViewerAPIExtended} from '../Infrastructure/IfcViewerAPIExtended'
import FileContext from '../OPFS/FileContext'
import {
  getModelFromOPFS,
  loadLocalFileDragAndDrop,
  downloadToOPFS,
} from '../OPFS/utils'
import {navToDefault} from '../Share'
import {usePlaceMark} from '../hooks/usePlaceMark'
import * as Analytics from '../privacy/analytics'
import useStore from '../store/useStore'
import {
  getDownloadURL,
  getLatestCommitHash,
  parseGitHubRepositoryURL,
} from '../utils/GitHub'
// TODO(pablo): use ^^ instead of this
import {parseGitHubPath} from '../utils/location'
import {computeElementPathIds, setupLookupAndParentLinks} from '../utils/TreeUtils'
import {assertDefined} from '../utils/assert'
import debug from '../utils/debug'
import {handleBeforeUnload} from '../utils/event'
import {groupElementsByTypes} from '../utils/ifc'
import {
  loadLocalFile,
  loadLocalFileFallback,
  loadLocalFileDragAndDropFallback,
  getUploadedBlobPath,
} from '../utils/loader'
import {navWith} from '../utils/navigate'
import {setKeydownListeners} from '../utils/shortcutKeys'
import SearchIndex from './SearchIndex'


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

  const {setFile} = useContext(FileContext) // Consume the context
  debug().log('CadView#init: count: ', count++)
  // React router
  const navigate = useNavigate()
  // TODO(pablo): Removing this setter leads to a very strange stack overflow
  // eslint-disable-next-line no-unused-vars
  const [searchParams, setSearchParams] = useSearchParams()

  // Drag and Drop
  // Add a new state for drag over effect
  const [dragOver, setDragOver] = useState(false)

  // Drag event handlers
  const handleDragOver = (event) => {
    event.preventDefault()
    setDragOver(true)
  }

  const handleDragEnter = (event) => {
    event.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (event) => {
    event.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragOver(false)
    const files =
      event.dataTransfer.files
    // Here you can handle the files as needed
    if (files.length === 1) {
      if (isOPFSAvailable) {
        loadLocalFileDragAndDrop(
            navigate,
            appPrefix,
            handleBeforeUnload,
            files[0])
      } else {
        loadLocalFileDragAndDropFallback(
            navigate,
            appPrefix,
            handleBeforeUnload,
            files[0],
        )
      }
    }
  }

  // IFC
  const [rootElement, setRootElement] = useState({})
  const [elementsById] = useState({})
  const [defaultExpandedElements, setDefaultExpandedElements] = useState([])
  const [expandedElements, setExpandedElements] = useState([])
  const [defaultExpandedTypes, setDefaultExpandedTypes] = useState([])
  const [expandedTypes, setExpandedTypes] = useState([])
  const [navigationMode, setNavigationMode] = useState('spatial-tree')

  // UI elts
  const theme = useTheme()
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [alert, setAlert] = useState(null)
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [model, setModel] = useState(null)

  // Zustand store
  const viewer = useStore((state) => state.viewer)
  const setViewer = useStore((state) => state.setViewer)
  const customViewSettings = useStore((state) => state.customViewSettings)
  // setModelStore instead of setModel since there's already a state var with this name
  const setModelStore = useStore((state) => state.setModelStore)
  const isNavPanelOpen = useStore((state) => state.isNavPanelOpen)
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const setCutPlaneDirections = useStore((state) => state.setCutPlaneDirections)
  const setIsNavPanelOpen = useStore((state) => state.setIsNavPanelOpen)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const setSelectedElement = useStore((state) => state.setSelectedElement)
  const setSelectedElements = useStore((state) => state.setSelectedElements)
  const setElementTypesMap = useStore((state) => state.setElementTypesMap)
  const elementTypesMap = useStore((state) => state.elementTypesMap)
  const selectedElements = useStore((state) => state.selectedElements)
  const preselectedElementIds = useStore((state) => state.preselectedElementIds)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const accessToken = useStore((state) => state.accessToken)
  const sidebarWidth = useStore((state) => state.sidebarWidth)
  const [modelReady, setModelReady] = useState(false)
  const isMobile = useIsMobile()
  const location = useLocation()
  const setLoadedFileInfo = useStore((state) => state.setLoadedFileInfo)
  // Granular visibility controls for the UI components
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  const isNavigationPanelVisible = useStore((state) => state.isNavigationPanelVisible)
  const isSearchVisible = useStore((state) => state.isSearchVisible)
  const isNavigationVisible = useStore((state) => state.isNavigationVisible)
  const isVersionHistoryVisible = useStore((state) => state.isVersionHistoryVisible)

  // Place Mark
  const {createPlaceMark, onSceneSingleTap, onSceneDoubleTap} = usePlaceMark()

  // Auth
  const {isLoading: isAuthLoading, isAuthenticated} = useAuth0()
  const [isViewerLoaded, setIsViewerLoaded] = useState(false)

  // opfs
  const isOPFSAvailable = useStore((state) => state.isOPFSAvailable)


  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!isViewerLoaded) {
      // This function gets called whenever there's a change in authentication / opfs state
      debug().log('Auth state changed. isAuthLoading:', isAuthLoading, 'isAuthenticated:', isAuthenticated)
      /* eslint-disable no-mixed-operators */
      if ((!isAuthLoading &&
          (isAuthenticated && accessToken !== '') ||
          (!isAuthLoading && !isAuthenticated)) &&
          isOPFSAvailable !== null) {
        (async () => {
          await onViewer()
        })()
      }
      /* eslint-enable no-mixed-operators */
    }
  }, [isAuthLoading, isAuthenticated, accessToken, isOPFSAvailable])

  /* eslint-disable react-hooks/exhaustive-deps */
  // ModelPath changes in parent (ShareRoutes) from user and
  // programmatic navigation (e.g. clicking element links).
  useEffect(() => {
    debug().log('CadView#useEffect1[modelPath], calling onModelPath...')
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
      if (!Array.isArray(selectedElements) || !viewer) {
        return
      }
      // Update The selection on the scene pick/unpick
      const ids = selectedElements.map((id) => parseInt(id))
      await viewer.setSelection(0, ids)
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
        const types = elementTypesMap.filter((t) => t.elements.filter((e) => ids.includes(e.expressID)).length > 0).map((t) => t.name)
        if (types.length > 0) {
          setExpandedTypes([...new Set(types.concat(expandedTypes))])
        }
      } else {
        setSelectedElement(null)
      }
    })()
  }, [selectedElements])


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
    }
    initViewerCb(undefined, theme)
    theme.addThemeChangeListener(initViewerCb)
  }


  /** When viewer is ready, load IFC model. */
  async function onViewer() {
    if (isOPFSAvailable === null) {
      debug().warn('Do not have opfs status yet, waiting.')
      return
    }

    if (viewer === null) {
      debug().warn('CadView#onViewer, viewer is null')
      return
    }

    if (isAuthLoading || (!isAuthLoading && isAuthenticated && accessToken === '')) {
      debug().warn('Do not have auth token yet, waiting.')
      return
    }

    setModelReady(false)

    // define mesh colors for selected and preselected element
    const preselectMat = new MeshLambertMaterial({
      transparent: true,
      opacity: 0.5,
      color: theme.palette.primary.main,
      depthTest: true,
    })
    const selectMat = new MeshLambertMaterial({
      transparent: true,
      color: theme.palette.primary.main,
      depthTest: true,
    })

    if (viewer.IFC.selector) {
      viewer.IFC.selector.preselection.material = preselectMat
      viewer.IFC.selector.selection.material = selectMat
    }

    const pathToLoad = modelPath.gitpath || (installPrefix + modelPath.filepath)
    const tmpModelRef = await loadIfc(pathToLoad, modelPath.gitpath)

    if (tmpModelRef === undefined) {
      return
    }
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

    setIsViewerLoaded(true)
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
   * @param {string} gitpath to use for constructing API endpoints
   */
  async function loadIfc(filepath, gitpath) {
    debug().log(`CadView#loadIfc: `, filepath)
    const uploadedFile = pathPrefix.endsWith('new')

    if (uploadedFile) {
      filepath = getUploadedBlobPath(filepath)
      debug().log('CadView#loadIfc: parsed blob: ', filepath)
      window.addEventListener('beforeunload', handleBeforeUnload)
    }

    const loadingMessageBase = `Loading ${filepath}`
    setIsModelLoading(true)
    setSnackMessage(`${loadingMessageBase}`)

    // NB: for LFS targets, this will now be media.githubusercontent.com, so
    // don't use for further API endpoint construction.
    const ifcURL = (uploadedFile || filepath.indexOf('/') === 0) ? filepath : await getFinalURL(filepath, accessToken)

    let loadedModel
    if (!isOPFSAvailable) {
      // fallback to loadIfcUrl
      loadedModel = await viewer.loadIfcUrl(
          ifcURL,
          !urlHasCameraParams(), // fit to frame
          (progressEvent) => {
            if (Number.isFinite(progressEvent.loaded)) {
              const loadedBytes = progressEvent.loaded
              // eslint-disable-next-line no-magic-numbers
              const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
              setSnackMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
              debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
            }
          },
          (error) => {
            debug().log('CadView#loadIfc$onError: ', error)
            // TODO(pablo): error modal.
            setIsModelLoading(false)
            setSnackMessage('')
            setAlertMessage(`Could not load file: ${filepath}. Please try logging in if the repository is private.`)
          }, customViewSettings)
    } else if (uploadedFile) {
      const file = await getModelFromOPFS('BldrsLocalStorage', 'V1', 'Projects', filepath)

      if (file instanceof File) {
        setFile(file)
      } else {
        debug().error('Retrieved object is not of type File.')
      }


      loadedModel = await viewer.loadIfcFile(
          file,
          !urlHasCameraParams(),
          (error) => {
            debug().log('CadView#loadIfc$onError: ', error)
            // TODO(pablo): error modal.
            setIsModelLoading(false)
            setAlertMessage(`Could not load file: ${filepath}`)
          }, customViewSettings)
      // TODO(nickcastel50): need a more permanent way to
      // prevent redirect here for bundled ifc files
    } else if (ifcURL === '/index.ifc') {
      const file = await downloadToOPFS(
          navigate,
          appPrefix,
          handleBeforeUnload,
          ifcURL,
          'index.ifc',
          'bldrs-ai',
          'BldrsLocalStorage',
          'V1',
          'Projects',
          (progressEvent) => {
            if (Number.isFinite(progressEvent.receivedLength)) {
              const loadedBytes = progressEvent.receivedLength
              // eslint-disable-next-line no-magic-numbers
              const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
              setSnackMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
              debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
            }
          })

      if (file instanceof File) {
        setFile(file)
      } else {
        debug().error('Retrieved object is not of type File.')
      }

      loadedModel = await viewer.loadIfcFile(
          file,
          !urlHasCameraParams(),
          (error) => {
            debug().log('CadView#loadIfc$onError: ', error)
            // TODO(pablo): error modal.
            setIsModelLoading(false)
            setAlertMessage(`Could not load file: ${filepath}. Please try logging in if the repository is private.`)
          }, customViewSettings)
    } else if (ifcURL === '/haus.ifc') {
      loadedModel = await viewer.loadIfcUrl(
          ifcURL,
          !urlHasCameraParams(), // fit to frame
          (progressEvent) => {
            if (Number.isFinite(progressEvent.loaded)) {
              const loadedBytes = progressEvent.loaded
              // eslint-disable-next-line no-magic-numbers
              const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
              setSnackMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
              debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
            }
          },
          (error) => {
            debug().log('CadView#loadIfc$onError: ', error)
            // TODO(pablo): error modal.
            setIsModelLoading(false)
            setSnackMessage('')
            setAlertMessage(`Could not load file: ${filepath}. Please try logging in if the repository is private.`)
          }, customViewSettings)
    } else {
      // TODO(pablo): probably already available in this scope, or use
      // parseGitHubRepositoryURL instead.
      try {
        const {isPublic, owner, repo, branch, filePath} = parseGitHubPath(new URL(gitpath).pathname)
        const commitHash = isPublic ?
            await getLatestCommitHash(owner, repo, filePath, '', branch) :
            await getLatestCommitHash(owner, repo, filePath, accessToken, branch)

        if (commitHash === null) {
          debug().error(`Error obtaining commit hash for: ${ifcURL}`)
        }

        const file = await downloadToOPFS(
            navigate,
            appPrefix,
            handleBeforeUnload,
            ifcURL,
            filePath,
            commitHash,
            owner,
            repo,
            branch,
            (progressEvent) => {
              if (Number.isFinite(progressEvent.receivedLength)) {
                const loadedBytes = progressEvent.receivedLength
                // eslint-disable-next-line no-magic-numbers
                const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
                setSnackMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
                debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
              }
            })

        if (file instanceof File) {
          setFile(file)
        } else {
          debug().error('Retrieved object is not of type File.')
        }

        loadedModel = await viewer.loadIfcFile(
            file,
            !urlHasCameraParams(),
            (error) => {
              debug().log('CadView#loadIfc$onError: ', error)
              // TODO(pablo): error modal.
              setIsModelLoading(false)
              setAlertMessage(`Could not load file: ${filepath}. Please try logging in if the repository is private.`)
            }, customViewSettings)
      } catch (error) {
        setIsModelLoading(false)
        setAlertMessage(`Could not load file: ${filepath}. Please try logging in if the repository is private.`)
        return
      }
    }

    await viewer.isolator.setModel(loadedModel)

    Analytics.recordEvent('select_content', {
      content_type: 'ifc_model',
      item_id: filepath,
    })
    setIsModelLoading(false)
    setSnackMessage('')

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
      updateLoadedFileInfo(uploadedFile, ifcURL)
      return loadedModel
    }

    debug().error('CadView#loadIfc: Model load failed!')
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
    const rootElt = await m.ifcManager.getSpatialStructure(0, true)
    debug().log('CadView#onModel: rootElt: ', rootElt)
    if (rootElt.expressID === undefined) {
      throw new Error('Model has undefined root express ID')
    }
    setupLookupAndParentLinks(rootElt, elementsById)
    setDblClickListener()
    setKeydownListeners(viewer, selectItemsInScene)
    initSearch(m, rootElt)
    const rootProps = await viewer.getProperties(0, rootElt.expressID)
    rootElt.Name = rootProps.Name
    rootElt.LongName = rootProps.LongName
    setRootElement(rootElt)
    setElementTypesMap(groupElementsByTypes(rootElt))
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
      const types = elementTypesMap.filter((t) => t.elements.filter((e) => resultIDs.includes(e.expressID)).length > 0).map((t) => t.name)
      if (types.length > 0) {
        setDefaultExpandedTypes(types)
      }
      Analytics.recordEvent('search', {
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
    navWith(navigate, `${pathPrefix}${repoFilePath}`, {search: '', hash: ''})
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
        navWith(navigate, `${pathPrefix}${repoFilePath}/${path}`, {search: '', hash: ''})
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

  /** Select items in model when they are double-clicked */
  function setDblClickListener() {
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


  /**
   * handles updating the stored file meta data for all cases except local files.
   *
   * @param {string} ifcUrl the final ifcUrl that was passed to the viewer
   */
  function updateLoadedFileInfo(uploadedFile, ifcUrl) {
    if (uploadedFile) {
      return
    }
    const githubRegex = /(raw.githubusercontent|github.com)/gi
    if (ifcUrl.indexOf('/') === 0) {
      setLoadedFileInfo({
        source: 'share', info: {
          url: `${window.location.protocol}//${window.location.host}${ifcUrl}`,
        },
      })
    } else if (githubRegex.test(ifcUrl)) {
      setLoadedFileInfo({source: 'github', info: {url: ifcUrl}})
    }
  }

  const windowDimensions = useWindowDimensions()
  const spacingBetweenSearchAndOpsGroupPx = 20
  const operationsGroupWidthPx = 100
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
        zIndex: 10, // Adjust if needed
        boxSizing: 'border-box', // Adjust if needed
      }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: dragOver ? `2px dashed ${theme.palette.primary.main}` : 'none',
        // ... other styling as needed
      }}
      data-testid={'cadview-dropzone'}
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
      <SnackBarMessage/>
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
          <ControlsGroup
            navigate={navigate}
            isRepoActive={modelPath.repo !== undefined}
            isOPFSAvailable={isOPFSAvailable}
          />
          {isSearchBarVisible && isSearchVisible &&
           <Box sx={{marginTop: '0.82em', width: '100%'}}>
             <SearchBar
               fileOpen={
                 () => {
                   // Use loadLocalFile if OPFS is available, else use loadLocalFileFallback
                   if (isOPFSAvailable) {
                     loadLocalFile(
                         navigate,
                         appPrefix,
                         handleBeforeUnload,
                         false,
                     )
                   } else {
                     loadLocalFileFallback(
                         navigate,
                         appPrefix,
                         handleBeforeUnload,
                         false,
                     )
                   }
                 }}
             />
           </Box>
          }
          <Box sx={{marginTop: '.82em', width: '100%'}}>
            {isNavPanelOpen &&
              isNavigationPanelVisible &&
              isNavigationVisible &&
              <NavPanel
                model={model}
                element={rootElement}
                defaultExpandedElements={defaultExpandedElements}
                defaultExpandedTypes={defaultExpandedTypes}
                expandedElements={expandedElements}
                setExpandedElements={setExpandedElements}
                expandedTypes={expandedTypes}
                setExpandedTypes={setExpandedTypes}
                navigationMode={navigationMode}
                setNavigationMode={setNavigationMode}
                selectWithShiftClickEvents={selectWithShiftClickEvents}
                pathPrefix={
                  pathPrefix + (modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath)
                }
              />
            }
            {
              modelPath.repo !== undefined && isVersionHistoryVisible &&
              <VersionsContainer
                filePath={modelPath.filepath}
                currentRef={modelPath.branch}
              />
            }
          </Box>
        </Box>
      )}
      {alert}
      {viewer &&
        <Box
          sx={{
            position: 'fixed',
            bottom: '1.0em',
            width: '100%',
          }}
        >
          <ElementGroup deselectItems={deselectItems}/>
        </Box>
      }
      <Box
        sx={{
          position: 'fixed',
          bottom: '1.0em',
          left: '1.0em',
        }}
      >
        <AboutControl/>
      </Box>
      <Box
        sx={{
          position: 'fixed',
          bottom: '1.0em',
          right: '1.0em',
        }}
      >
        <HelpControl/>
      </Box>
      {viewer && <OperationsGroupAndDrawer deselectItems={deselectItems}/>
      }

      {isModelLoading &&
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100vh',
            backgroundColor: theme.palette.scene.background,
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              width: '40px',
              height: '40px',
              top: '30%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <Box
              sx={{
                'display': 'flex',
                'justifyContent': 'center',
                'alignItems': 'center',
                '.circleLoader': {
                  width: '1em',
                  height: '1em',
                  borderRadius: '50%',
                  backgroundColor: 'primary.main',
                  animation: 'diameterChange 1s infinite alternate',
                },
                '@keyframes diameterChange': {
                  '0%': {
                    transform: 'scale(2)',
                  },
                  '100%': {
                    transform: 'scale(2.5)',
                  },
                },
              }}
            >
              <Box
                data-testid="loader"
                className="circleLoader"
              />
            </Box>
          </Box>
        </Box>
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
            top: 0,
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
          <AppStoreSideDrawer/>
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
        <Box>
          <OperationsGroup deselectItems={deselectItems}/>
        </Box>
        <SideDrawer/>
        <AppStoreSideDrawer/>
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

  // This is necessary so that canvas can receive key events for shortcuts.
  const canvas = viewer.context.getDomElement()
  canvas.setAttribute('tabIndex', '0')

  return viewer
}


const getGitHubDownloadURL = async (url, accessToken) => {
  const repo = parseGitHubRepositoryURL(url)
  const downloadURL = await getDownloadURL({orgName: repo.owner, name: repo.repository}, repo.path, repo.ref, accessToken)
  return downloadURL
}


export const getFinalURL = async (url, accessToken) => {
  const u = new URL(url)
  debug().log('CadView#getFinalURL: url: ', url)
  debug().log('CadView#getFinalURL: accessToken: ', accessToken)
  debug().log('CadView#getFinalURL: process.env.RAW_GIT_PROXY_URL: ', process.env.RAW_GIT_PROXY_URL)

  switch (u.host.toLowerCase()) {
    case 'github.com':
      if (!accessToken) {
        const proxyURL = new URL(process.env.RAW_GIT_PROXY_URL || 'https://raw.githubusercontent.com')

        // Replace the protocol, host, and hostname in the target
        u.protocol = proxyURL.protocol
        u.host = proxyURL.host
        u.hostname = proxyURL.hostname

        // If the port is specified, replace it in the target URL
        if (proxyURL.port) {
          u.port = proxyURL.port
        }

        // If there's a path, *and* it's not just the root, then prepend it to the target URL
        if (proxyURL.pathname && proxyURL.pathname !== '/') {
          u.pathname = proxyURL.pathname + u.pathname
        }

        return u.toString()
      }

      debug().log('CadView#getFinalURL: calling getGitHubDownloadURL')
      return await getGitHubDownloadURL(url, accessToken)

    default:
      return url
  }
}
