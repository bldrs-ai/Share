import {MeshLambertMaterial} from 'three'
import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'

import {loadIfc} from './ifc'
import {initViewer} from './viewer'

import {groupElementsByTypes} from '../utils/ifc'
import {setKeydownListeners} from '../utils/shortcutKeys'

import {setupLookupAndParentLinks} from '../utils/TreeUtils'

import * as Analytics from '../privacy/analytics'


/**
 * Begin setup for new model. Turn off nav, search and item and init
 * new viewer.
 */
export function onModelPath(pathPrefix, setViewer, theme, setIsSearchBarVisible) {
  setIsSearchBarVisible(false)
  // TODO(pablo): First arg isn't used for first time, and then it's
  // newMode for the themeChangeListeners, which is also unused.
  const initViewerCb = (any, themeArg) => {
    const initializedViewer = initViewer(
      pathPrefix,
      assertDefined(themeArg.palette.primary.sceneBackground))
    setViewer(initializedViewer)
  }
  initViewerCb(undefined, theme)
  theme.addThemeChangeListener(initViewerCb)
}


/** When viewer is ready, load IFC model. */
export async function onViewer(
  {viewer, setIsViewerLoaded,
  installPrefix, appPrefix, pathPrefix,
  modelPath, setIsModelLoading, setModel, setIsModelReady, updateLoadedFileInfo,
  isAuthLoading, isAuthenticated, accessToken,
  theme, setAlertMessage, setSnackMessage,
  elementsById, hiddenElements, customViewSettings,
  navigate, setFile,
  setRootElement, setElementTypesMap,
   searchIndex}) {
  if (viewer === null || pathPrefix === null) {
    debug().warn('CadView#onViewer, viewer is null')
    return
  }

  if (isAuthLoading || (!isAuthLoading && isAuthenticated && accessToken === '')) {
    debug().warn('Do not have auth token yet, waiting.')
    return
  }

  setIsModelReady(false)

  setupViewerHighlightColor(viewer, theme.palette.primary.sceneHighlight)

  const filepath = modelPath.gitpath || (installPrefix + modelPath.filepath)
  debug().log(`pathToLoad: ${filepath}, modelPath.gitpath: ${modelPath.gitpath},` +
              `installPrefix: ${installPrefix}, modelPath.filepath: ${modelPath.filepath}`)
  const tmpModelRef = await loadIfc({
    viewer,
    filepath, appPrefix, pathPrefix,
    setIsModelLoading, setModel, setSnackMessage,
    accessToken,
    customViewSettings,
    navigate, setFile,
    updateLoadedFileInfo})
  setIsModelLoading(false)

  if (tmpModelRef === undefined || tmpModelRef === null) {
    setAlertMessage(`Could not load model: ${filepath}`)
    return
  }
  // Leave snack message until here so alert box handler can clear
  // it after user says OK.
  setSnackMessage(null)

  if (tmpModelRef === 'redirect') {
    return
  }

  debug().log('CadView#onViewer: tmpModelRef: ', tmpModelRef)
  await onModel(viewer, tmpModelRef, elementsById, setRootElement, setElementTypesMap, searchIndex)
  setIsModelReady(true)

  // TODO setDblClickListener(viewer)
  // TODO setKeydownListeners(viewer, (ids) => selectItemsInScene(viewer, ids))

  selectElementBasedOnFilepath(viewer, filepath)
  setupViewerModelHiddenElements(viewer, hiddenElements)
  setupViewerModelPlacemarks(viewer, tmpModelRef)

  setIsViewerLoaded(true)
}


/**
 * @param {object} viewer
 * @param {string} highlight
 */
function setupViewerHighlightColor(viewer, highlightColor) {
  // define mesh colors for selected and preselected element
  const preselectMat = new MeshLambertMaterial({
    transparent: true,
    opacity: 0.5,
    color: highlightColor,
    depthTest: true,
  })

  const selectMat = new MeshLambertMaterial({
    transparent: true,
    color: highlightColor,
    depthTest: true,
  })

  if (viewer.IFC.selector) {
    viewer.IFC.selector.preselection.material = preselectMat
    viewer.IFC.selector.selection.material = selectMat
  }
}


/**
 * Maintain hidden elements if any
 *
 * @param {object} viewer
 * @param {object} hidddenElements
 */
function setupViewerModelHiddenElements(viewer, hiddenElements) {
  const previouslyHiddenELements = Object.entries(hiddenElements)
        .filter(([key, value]) => value === true).map(([key, value]) => Number(key))
  if (previouslyHiddenELements.length > 0) {
    viewer.isolator.unHideAllElements()
    viewer.isolator.hideElementsById(previouslyHiddenELements)
  }
}


/**
 * Create placemark(s?)
 *
 * @param {object} viewer
 * @param {object} model
 */
function setupViewerModelPlacemarks(viewer, model) {
  /* import usePlaceMark from '../hooks/usePlaceMark'
  const {createPlaceMark} = usePlaceMark()
  createPlaceMark({
    context: viewer.context,
    oppositeObjects: [tmpModelRef],
    postProcessor: viewer.postProcessor,
    })
  */
}


/**
 * Analyze loaded IFC model to configure indexes, rootElt, etc.. No UI
 * selection setup.
 *
 * @param {object} m IFCjs loaded model.
 */
async function onModel(viewer, model, elementsById, setRootElement, setElementTypesMap, searchIndex) {
  assertDefined(model)
  debug().log('CadView#onModel', model)
  const rootElt = await model.ifcManager.getSpatialStructure(0, true)
  debug().log('CadView#onModel: rootElt: ', rootElt)
  if (rootElt.expressID === undefined) {
    throw new Error('Model has undefined root express ID')
  }
  setupLookupAndParentLinks(rootElt, elementsById)
  initSearch(searchIndex, model, rootElt)
  const rootProps = await viewer.getProperties(0, rootElt.expressID)
  rootElt.Name = rootProps.Name
  rootElt.LongName = rootProps.LongName
  setRootElement(rootElt)
  setElementTypesMap(groupElementsByTypes(rootElt))
}


/**
 * Index the model starting at the given rootElt, clearing any
 * previous index data and parses any incoming search params in the
 * URL.  Enables search bar when done.
 *
 * @param {object} m The IfcViewerAPIExtended instance.
 * @param {object} rootElt Root ifc element for recursive indexing.
 */
function initSearch(searchIndex, m, rootElt) {
  searchIndex.clearIndex()
  debug().log('CadView#initSearch: ', m, rootElt)
  debug().time('build searchIndex')
  searchIndex.indexElement({properties: m}, rootElt)
  debug().timeEnd('build searchIndex')
  onSearchParams()
}


/**
 * Search for the query in the index and select matching items in UI
 * elts.
 */
export function onSearchParams(
  viewer,
  searchIndex,
  setDefaultExpandedElements,
  setDefaultExpandedTypes,
  elementTypesMap) {
  const sp = new URLSearchParams(window.location.search)
  let query = sp.get('q')
  if (query) {
    query = query.trim()
    if (query === '') {
      throw new Error('IllegalState: empty search query')
    }
    const resultIds = searchIndex.search(query)
    // TODO selectItemsInScene(viewer, resultIds, false)
    setDefaultExpandedElements(resultIds.map((id) => `${id}`))
    const types = elementTypesMap
          .filter((t) => t.elements.filter((e) => resultIds.includes(e.expressID)).length > 0)
          .map((t) => t.name)
    if (types.length > 0) {
      setDefaultExpandedTypes(types)
    }
    Analytics.recordEvent('search', {
      search_term: query,
    })
  } else {
    // TODO resetSelection()
  }
}


/**
 * Extracts the path to the element from the url and selects the element
 *
 * @param {string} filepath Part of the URL that is the file path, e.g. index.ifc/1/2/3/...
 */
export function selectElementBasedOnFilepath(viewer, filepath, selectItemsInScene) {
  const parts = filepath.split(/\//)
  if (parts.length > 0) {
    debug().log('CadView#selectElementBasedOnUrlPath: have path', parts)
    const targetId = parseInt(parts[parts.length - 1])
    const selectedInViewer = viewer.getSelectedIds()
    if (isFinite(targetId) && !selectedInViewer.includes(targetId)) {
      console.warn('TODO selectItemsInScene')
      // TODO
      // selectItemsInScene(viewer, [targetId], false)
    }
  }
}


/**
 * Returns the ids of path parts from root to this elt in spatial
 * structure.
 *
 * @param {number} expressId
 * @return {Array} pathIds
 */
export function getPathIdsForElements(expressId, elementsById) {
  const lookupElt = elementsById[parseInt(expressId)]
  if (!lookupElt) {
    debug().warn(`CadView#getPathIdsForElements(${expressId}) missing in table:`, elementsById)
    return undefined
  }
  const pathIds = computeElementPathIds(lookupElt, (elt) => elt.expressID)
  return pathIds
}
