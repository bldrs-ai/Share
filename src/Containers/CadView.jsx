import React, {useEffect, useContext, useState} from 'react'
import {useNavigate, useSearchParams, useLocation} from 'react-router-dom'
import {useAuth0} from '@auth0/auth0-react'
import useTheme from '@mui/styles/useTheme'
import AboutControl from '../Components/About/AboutControl'
import HelpControl from '../Components/HelpControl'
import {useIsMobile} from '../Components/Hooks'
import LoadingBackdrop from '../Components/LoadingBackdrop'
import FileContext from '../OPFS/FileContext'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {navWith} from '../utils/navigate'
import AlertDialogAndSnackbar from './AlertDialogAndSnackbar'
import ModelGroup from './ModelGroup'
import ViewRoot from './ViewRoot'
import {
  getPathIdsForElements,
  onModelPath,
  onViewer,
  onSearchParams,
  selectElementBasedOnFilepath,
} from './model'
import useNavTree from './useNavTree'


let count = 0

/**
 * Only container for the for the app.  Hosts the IfcViewer as well as
 * nav components.
 *
 * @return {React.ReactElement}
 */
export default function CadView() {
  debug(5).log('CadView#init: count: ', count++)

  // Begin useStore //
  // AppSlice
  const appPrefix = useStore((state) => state.appPrefix)
  const installPrefix = useStore((state) => state.installPrefix)
  const pathPrefix = useStore((state) => state.pathPrefix)

  // IFCSlice
  const customViewSettings = useStore((state) => state.customViewSettings)
  const elementTypesMap = useStore((state) => state.elementTypesMap)
  const model = useStore((state) => state.model)
  const preselectedElementIds = useStore((state) => state.preselectedElementIds)
  const setElementTypesMap = useStore((state) => state.setElementTypesMap)
  const setIsModelLoading = useStore((state) => state.setIsModelLoading)
  const setIsModelReady = useStore((state) => state.setIsModelReady)
  const setLoadedFileInfo = useStore((state) => state.setLoadedFileInfo)
  const setModel = useStore((state) => state.setModel)
  const setRootElement = useStore((state) => state.setRootElement)
  const viewer = useStore((state) => state.viewer)
  const setViewer = useStore((state) => state.setViewer)

  // IfcIsolatorSlice
  const hiddenElements = useStore((state) => state.hiddenElements)

  // NavTreeSlice
  const setDefaultExpandedElements = useStore((state) => state.setDefaultExpandedElements)
  const setDefaultExpandedTypes = useStore((state) => state.setDefaultExpandedTypes)
  const setSelectedElements = useStore((state) => state.setSelectedElements)

  // RepositorySlice
  const accessToken = useStore((state) => state.accessToken)
  const modelPath = useStore((state) => state.modelPath)

  // SearchSlice
  const searchIndex = useStore((state) => state.searchIndex)
  const setIsSearchBarVisible = useStore((state) => state.setIsSearchBarVisible)

  // SideDrawerSlice
  const isSideDrawerVisible = useStore((state) => state.isSideDrawerVisible)
  const sidebarWidth = useStore((state) => state.sidebarWidth)

  // UISlice
  const setAlertMessage = useStore((state) => state.setAlertMessage)
  const setSnackMessage = useStore((state) => state.setSnackMessage)


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
  const {setFile} = useContext(FileContext) // Consume the context
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()


  // Begin helpers //

  /** Select items in model when they are double-clicked */
  function setDblClickListener(viewerArg) {
    window.ondblclick = (event) => canvasDoubleClickHandler(event, viewerArg)
  }


  /** Handle double click event on canvas. */
  async function canvasDoubleClickHandler(event, viewerArg) {
    if (!event.target || event.target.tagName !== 'CANVAS') {
      return
    }
    const item = await viewer.castRayToIfcScene()
    if (!item) {
      return
    }
    selectWithShiftClickEvents(event.shiftKey, item.id, viewerArg)
  }


  /**
   * Select/Deselect items in the scene using shift+click
   *
   * @param {boolean} shiftKey the click event
   * @param {number} expressId the express id of the element
   */
  function selectWithShiftClickEvents(shiftKey, expressId, viewerArg) {
    if (!viewerArg.isolator.canBePickedInScene(expressId)) {
      return
    }
    let selectedIds
    if (shiftKey) {
      const selectedInViewer = viewerArg.getSelectedIds()
      const indexOfItem = selectedInViewer.indexOf(expressId)
      const alreadySelected = indexOfItem !== -1
      if (alreadySelected) {
        selectedInViewer.splice(indexOfItem, 1)
      } else {
        selectedInViewer.push(expressId)
      }
      selectedIds = selectedInViewer
    } else {
      selectedIds = [expressId]
    }
    selectItemsInScene(viewerArg, selectedIds)
  }


  /**
   * Pick the given items in the scene
   *
   * @param {Array} elementIds Array of expressIDs
   */
  function selectItemsInScene(v, elementIds, updateNavigation = true) {
    // NOTE: we might want to compare with previous selection to avoid unnecessary updates
    if (!v) {
      return
    }
    try {
      // Update The Component state
      setSelectedElements(elementIds.map((id) => `${id}`))

      // Sets the url to the last selected element path.
      if (elementIds.length > 0 && updateNavigation) {
        const lastId = elementIds.slice(-1)
        const pathIds = getPathIdsForElements(lastId)
        const repoFilePath = modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath
        const path = pathIds.join('/')
        navWith(
          navigate,
          `${pathPrefix}${repoFilePath}/${path}`,
          {
            // TODO(pablo): unclear if search should be carried
            search: '',
            // TODO(pablo): necessary to preserve UI state
            hash: window.location.hash,
          })
      }
    } catch (e) {
      // IFCjs will throw a big stack trace if there is not a visual
      // element, e.g. for IfcSite, but we still want to proceed to
      // setup its properties.
      debug().log('TODO: no visual element for item ids: ', elementIds)
    }
  }

  // Other helpers

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


  // Begin useEffect //
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!isViewerLoaded) {
      // This function gets called whenever there's a change in
      // authentication state
      debug().log('Auth state changed. isAuthLoading:', isAuthLoading,
                  'isAuthenticated:', isAuthenticated)
      /* eslint-disable no-mixed-operators */
      if (!isAuthLoading &&
          (isAuthenticated && accessToken !== '') ||
          (!isAuthLoading && !isAuthenticated)) {
        (async () => {
          await onViewer(
            {viewer, setIsViewerLoaded,
            installPrefix, appPrefix, pathPrefix,
            modelPath, setIsModelLoading, setModel, setIsModelReady, updateLoadedFileInfo,
            isAuthLoading, isAuthenticated, accessToken,
            theme, setAlertMessage, setSnackMessage,
            elementsById, hiddenElements, customViewSettings,
            navigate, setFile,
            setRootElement, setElementTypesMap,
             searchIndex})
        })()
      }
      /* eslint-enable no-mixed-operators */
    }
  }, [isAuthLoading, isAuthenticated, accessToken])


  // ModelPath changes in parent (ShareRoutes) from user and
  // programmatic navigation (e.g. clicking element links).
  useEffect(() => {
    debug().log('CadView#useEffect1[modelPath], calling onModelPath...')
    onModelPath(pathPrefix, setViewer, theme, setIsSearchBarVisible)
  }, [modelPath, pathPrefix, setViewer, theme, setIsSearchBarVisible])


  // Viewer changes in onModelPath (above)
  useEffect(() => {
    (async () => {
      await onViewer(
        {viewer, setIsViewerLoaded,
        installPrefix, appPrefix, pathPrefix,
        modelPath, setIsModelLoading, setModel, setIsModelReady, updateLoadedFileInfo,
        isAuthLoading, isAuthenticated, accessToken,
        theme, setAlertMessage, setSnackMessage,
        elementsById, hiddenElements, customViewSettings,
        navigate, setFile,
        setRootElement, setElementTypesMap,
         searchIndex})
    })()
  }, [viewer])


  // searchParams changes in parent (ShareRoutes) from user and
  // programmatic navigation, and in SearchBar.
  useEffect(() => {
    onSearchParams(
      viewer,
      searchIndex,
      setDefaultExpandedElements,
      setDefaultExpandedTypes,
      elementTypesMap,
    )
  }, [searchParams])


  useNavTree(elementsById, elementTypesMap)


  useEffect(() => {
    (async () => {
      if (Array.isArray(preselectedElementIds) && preselectedElementIds.length && viewer) {
        await viewer.preselectElementsByIds(0, preselectedElementIds)
      }
    })()
  }, [preselectedElementIds])
  /* eslint-enable */


  // Watch for path changes within the model.
  // TODO(pablo): would be nice to have more consistent handling of path parsing.
  useEffect(() => {
    if (model) {
      (() => {
        const parts = location.pathname.split(/\.ifc/i)
        const expectedPartCount = 2
        if (parts.length === expectedPartCount) {
          selectElementBasedOnFilepath(viewer, parts[1], selectItemsInScene)
        }
      })()
    }
  }, [location, model, selectItemsInScene, viewer])


  // Shrink the scene viewer when drawer is open.  This recenters the
  // view in the new shrunk canvas, which preserves what the user is
  // looking at.
  // TODO(pablo): add render testing
  useEffect(() => {
    if (viewer && !isMobile) {
      viewer.container.style.width = isSideDrawerVisible ? `calc(100% - ${sidebarWidth})` : '100%'
      viewer.context.resize()
    }
  }, [isSideDrawerVisible, isMobile, viewer, sidebarWidth])


  return (
    <ViewRoot>
      <ModelGroup/>
      <AboutControl/>
      <HelpControl/>
      <AlertDialogAndSnackbar/>
      <LoadingBackdrop/>
    </ViewRoot>
  )
}
