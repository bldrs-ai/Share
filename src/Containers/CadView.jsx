import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { makeStyles } from '@mui/styles'
import { Color } from 'three'
import { IfcViewerAPI } from 'web-ifc-viewer'
import SearchIndex from './SearchIndex.js'
import ItemPanelButton from '../Components/ItemPanel'
import NavPanel from '../Components/NavPanel'
import SearchBar from '../Components/SearchBar'
import ToolBar from '../Components/ToolBar'
import IconGroup from '../Components/IconGroup'
import SnackBarMessage from '../Components/SnackbarMessage'
import gtag from '../utils/gtag'
import debug from '../utils/debug'
import { assert } from '../utils/assert'
import { computeElementPath, setupLookupAndParentLinks } from '../utils/TreeUtils'


export default function CadView({installPrefix, appPrefix, pathPrefix}) {
  const classes = useStyles();
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [showNavPanel, setShowNavPanel] = useState(false);
  const [showItemPanel, setShowItemPanel] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [viewer, setViewer] = useState({});
  const [rootElement, setRootElement] = useState({});
  const elementsById = useState({});
  const [selectedElement, setSelectedElement] = useState({});
  const [selectedElements, setSelectedElements] = useState([]);
  const [defaultExpandedElements, setDefaultExpandedElements] = useState([]);
  const [expandedElements, setExpandedElements] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState();
  const onClickShare = () => setShowShare(!showShare);
  const [searchIndex, setSearchIndex] = useState({ clearIndex: () => {} });
  const [showShortCuts, setShowShortCuts] = useState(false)
  const [modelPath, setModelPath] = useState(null);
  const [pathToLoad, setPathToLoad] = useState(null);

  const navigate = useNavigate();
  const urlParams = useParams();


  /**
   * On a change to urlParams, setting a new model path will clear the
   * scene and load the new model IFC.  If there's not a valid IFC,
   * the helper will redirect to the index file.
   *
   * Otherwise, the param change is a sub-path, e.g. the IFC element
   * path, so no other useEffect is triggered.
   */
  useEffect(() => {
    setModelPathOrGotoIndexOrStay()
  }, [urlParams])


  /**
   * If there's a new modelPath set, then a new model needs to be
   * loaded into the scene.  This is split into two parts:
   *
   * 1) clearing the current scene and setting a new IfcViewerAPI.
   * 2) setting pathToLoad variable which does the new model load.
   *
   * TODO: Keeping this logic in the same effect was causing some null
   * references into the viewer object.
   */
  useEffect(() => {
    if (modelPath == null) {
      return;
    }
    newScene();
    // TODO: maybe push pathToLoad into modelPath.
    setPathToLoad(modelPath.gitpath || (installPrefix + modelPath.filepath));
  }, [modelPath])


  /** Finally, when we have a fully resolved model path to load, load it. */
  useEffect(() => {
    if (pathToLoad == null) {
      return;
    }
    loadIfc(pathToLoad);
  }, [pathToLoad])


  // Helpers //

  function newScene() {
    setShowNavPanel(false);
    setShowSearchBar(false);
    setShowItemPanel(false);
    setViewer(initViewer(pathPrefix));
  }


  function setModelPathOrGotoIndexOrStay() {
    const mp = getModelPath(installPrefix, pathPrefix, urlParams);
    if (mp === null) {
      // TODO: probe for index.ifc
      navigate(appPrefix + '/v/p/index.ifc');
      return;
    }
    if (modelPath === null
        || modelPath.filepath && modelPath.filepath != mp.filepath
        || modelPath.gitpath && modelPath.gitpath != mp.gitpath) {
      setModelPath(mp);
      debug().log('CadView#setModelPathOrGotoIndex: new model path: ', mp);
    }
  }


  /** Load IFC helper used by 1) useEffect on path change and 2) upload button. */
  async function loadIfc(filepath) {
    debug().log(`CadView#loadIfc: `, filepath, viewer);
    if (pathPrefix.endsWith('new')) {
      const l = window.location;
      debug(3).log('CadView#loadIfc: parsing blob from url: ', l);
      filepath = filepath.split('.ifc')[0];
      const parts = filepath.split('/');
      filepath = parts[parts.length - 1];
      debug(3).log('CadView#loadIfc: got: ', filepath);
      filepath = `blob:${l.protocol}//${l.hostname + (l.port ? ':' + l.port : '')}/${filepath}`
    }
    setIsLoading(true);
    const loadingMessageBase = `Loading ${filepath}`;
    setLoadingMessage(loadingMessageBase);
    const model = await viewer.IFC.loadIfcUrl(
      filepath,
      true,
      (progressEvent) => {
        if (Number.isFinite(progressEvent.loaded)) {
          const loadedBytes = progressEvent.loaded;
          const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2);
          setLoadingMessage(`${loadingMessageBase}: ${loadedMegs} MB`);
          debug(3).log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`);
        }
      },
      (error) => {
        console.error('CadView#loadIfc$onError', error);
        // TODO(pablo): error modal.
        setIsLoading(false);
      }
    );
    debug().log(`CadView#loadIfc: filepath(${filepath}) with model, viewer: `,
                model, viewer);
    viewer.IFC.addIfcModel(model);
    const rootElt = await model.ifcManager.getSpatialStructure(0, true);
    onModelLoad(rootElt, viewer, filepath);
    setIsLoading(false);
  }


  /** Select items in model when they're double-clicked. */
  async function setDoubleClickListener(filepath) {
    window.ondblclick = async (event) => {
      if (event.target && event.target.tagName == 'CANVAS') {
        const item = await viewer.IFC.pickIfcItem(true);
        if (item.modelID === undefined || item.id === undefined) return;
        const path = computeElementPath(elementsById[item.id], elt => elt.expressID);
        if (modelPath.gitpath) {
          navigate(pathPrefix + modelPath.getRepoPath() + path);
        } else {
          navigate(pathPrefix + modelPath.filepath + path);
        }
        setSelectedElement(item);
      }
    }
  }


  function loadLocalFile() {
    const viewerContainer = document.getElementById('viewer-container');
    const fileInput = document.createElement('input');
    fileInput.setAttribute('type', 'file');
    fileInput.classList.add('file-input');
    fileInput.addEventListener(
      'change',
      (event) => {
        let ifcUrl = URL.createObjectURL(event.target.files[0]);
        const parts = ifcUrl.split('/');
        ifcUrl = parts[parts.length - 1];
        navigate(`${appPrefix}/v/new/${ifcUrl}.ifc`);
      },
      false
    );
    viewerContainer.appendChild(fileInput);
    fileInput.click();
  }


  function placeCutPlane() {
    viewer.clipper.createPlane();
  }


  function unSelectItems() {
    viewer.unpickIfcItems();
    viewer.clipper.deleteAllPlanes()
  }


  function clearSearch() {
    setSelectedElements([]);
    viewer.IFC.unpickIfcItems();
  }


  async function selectItems(resultIDs) {
    setSelectedElements(resultIDs.map((id) => id + ''));
    try {
      await viewer.pickIfcItemsByID(0, resultIDs, true);
    } catch (e) {
      // IFCjs will throw a big stack trace if there is not a visual
      // element, e.g. for IfcSite, but we still want to proceed to
      // setup its properties.
      debug(3).log('TODO: no visual element for item ids: ', resultIDs);
    }
  }


  function onSearch(query) {
    clearSearch();
    debug().log(`CadView#onSearch: query: ${query}`);
    query = query.trim();
    if (query === '') {
      return;
    }

    const resultIDs = searchIndex.search(query);
    selectItems(resultIDs);
    gtag('event', 'search', {
      search_term: query,
    });
  }


  async function onElementSelect(elt) {
    const id = elt.expressID;
    if (id === undefined) {
      throw new Error('Selected element is missing Express ID');
    }
    selectItems([id]);
    const props = await viewer.getProperties(0, elt.expressID);
    setSelectedElement(props);
    setShowItemPanel(false);

    // TODO(pablo): just found out this method is getting called a lot
    // when i added navigation on select, which flooded the browser
    // IPC.
    //console.log('CadView#onElementSelect: in...');
  }


  function onModelLoad(rootElt, viewer, pathLoaded) {
    debug().log('CadView#onModelLoad...');
    gtag('event', 'select_content', {
      content_type: 'ifc_model',
      item_id: pathLoaded,
    });
    setRootElement(rootElt);
    setupLookupAndParentLinks(rootElt, elementsById);
    const expanded = [rootElt.expressID + ''];
    let elt = rootElt;
    for (let i = 0; i < 3; i++) {
      if (elt.children.length > 0) {
        expanded.push(elt.expressID + '');
        elt = elt.children[0];
      }
    }
    setDefaultExpandedElements(expanded);
    searchIndex.clearIndex();
    const index = new SearchIndex(rootElt, viewer);
    index.indexElement(rootElt);
    // TODO(pablo): why can't i do:
    //   setSearchIndex(new SearchIndex(rootElt, viewer));
    //   searchIndex.indexElement(...);
    // When I try this searchIndex is actually a promise.
    setSearchIndex(index);
    setShowNavPanel(true);
    setShowSearchBar(true);
    setDoubleClickListener(pathLoaded);
  }


  // TODO(pablo): search suggest
  const onSearchModify = (query) => {};


  let isLoaded = Object.keys(rootElement).length === 0;

  return (
    <div className={classes.pageContainer}>
      <div className={classes.viewWrapper}>
        <div className={classes.viewContainer} id='viewer-container'></div>
      </div>
      <div className={classes.menusWrapper}>
        <ToolBar
          fileOpen={loadLocalFile}
          onClickShare={onClickShare}
          offsetTop={PANEL_TOP}/>
        <SnackBarMessage
          message={loadingMessage}
          type={'info'}
          open={isLoading}
        />
        <div className={classes.searchContainer}>
          {showSearchBar && (
            <SearchBar
              onSearch={onSearch}
              onSearchModify={onSearchModify}
              onClickMenu={() => setShowNavPanel(!showNavPanel)}
              disabled={isLoaded}
              open={showNavPanel}
            />
          )}
        </div>

        {showNavPanel &&
          <NavPanel
            viewer={viewer}
            element={rootElement}
            selectedElements={selectedElements}
            defaultExpandedElements={defaultExpandedElements}
            expandedElements={expandedElements}
            onElementSelect={onElementSelect}
            setExpandedElements={setExpandedElements}
            pathPrefix={pathPrefix + (modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath)}
          />}
        <div className={classes.itemPanelContainer}>
            <ItemPanelButton
              viewer={viewer}
              element={selectedElement}
              close = {()=>setShowItemPanel(false)}
              topOffset = {PANEL_TOP}
              placeCutPlane = {()=>placeCutPlane()}
              unSelectItem = {()=>unSelectItems()}
              toggleShortCutsPanel = {()=>setShowShortCuts(!showShortCuts)}/>
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
  );
};


/** @return IfcViewerAPI viewer */
function initViewer(pathPrefix) {
  const container = document.getElementById('viewer-container');
  // Clear any existing scene.
  container.textContent = '';
  const viewer = new IfcViewerAPI({
    container,
    backgroundColor: new Color('#E0E0E0'),
  });
  debug().log('CadView#initViewer: viewer created: ', viewer);
  // Path to web-ifc.wasm in serving directory.
  viewer.IFC.setWasmPath('./static/js/');
  viewer.addAxes();
  viewer.addGrid(50, 50);
  viewer.clipper.active = true;

  // Highlight items when hovering over them
  window.onmousemove = (event) => {
    viewer.prePickIfcItem(event);
  };

  window.onkeydown = (event) => {
    //add a plane
    if (event.code === 'KeyQ') {
      viewer.clipper.createPlane();
    }
    //delete all planes
    if (event.code === 'KeyW') {
      viewer.clipper.deletePlane();
    }
    if (event.code == 'KeyA') {
      viewer.IFC.unpickIfcItems();
    }
  };

  return viewer;
}


/**
 * Returns a reference to an IFC model file.  For use by IfcViewerAPI.load.
 *
 * Format is either a reference within this project's serving directory:
 *   {filepath: '/file.ifc'}
 *
 * or a global GitHub path:
 *   {gitpath: 'http://host/share/v/gh/buildrs/Share/main/haus.ifc'}
 */
// TODO: combine modelPath methods into class.
function getModelPath(installPrefix, pathPrefix, urlParams) {
  let m = null;
  let filepath = urlParams['*'];
  if (filepath == '') {
    return null;
  }
  const parts = filepath.split('.ifc');
  filepath = '/' + parts[0] + '.ifc'; // TODO(pablo)
  if (pathPrefix.endsWith('new') || pathPrefix.endsWith('/p')) {
    // * param is defined in ../Share.jsx, e.g.:
    //   /v/p/*.  It should be only the filename.
    // Filepath is a reference rooted in the serving directory.
    // e.g. /haus.ifc or /ifc-files/haus.ifc
    m = {
      filepath: filepath,
      eltPath: parts[1]
    };
    debug().log('CadView#getModelPath: is a project file: ', m);
  } else if (pathPrefix.endsWith('/gh')) {
    m = {
      org: urlParams['org'],
      repo: urlParams['repo'],
      branch: urlParams['branch'],
      filepath: filepath,
      eltPath: parts[1]
    };
    m.getRepoPath = () => `/${m.org}/${m.repo}/${m.branch}${m.filepath}`
    m.gitpath = `https://raw.githubusercontent.com${m.getRepoPath()}`
    debug().log('CadView#getModelPath: is a remote GitHub file: ', m);
  } else {
    throw new Error('Empty view type from pathPrefix')
  }
  return m;
}


const PANEL_TOP = 84;
const useStyles = makeStyles((theme) => ({
  pageContainer:{
    position: 'absolute',
    top: '0px',
    left: '0px',
    width: '100%',
    height: '100%'
  },
  viewerContainer:{
    zIndex: 0
  },
  toolBar:{
    zIndex: 100
  },
  menuToolbarContainer: {
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '10px',
    border:'1px solid red',
    '@media (max-width: 900px)': {
      marginTop: '40px',
    },
  },
  searchContainer: {
    position: 'absolute',
    top: `${PANEL_TOP}px`,
    left: '20px',
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
  viewWrapper:{
    zIndex: 0
  },
  menusWrapper:{
    zIndex: 100
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
    zIndex:1000,
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
    zIndex:1000,
  },
  iconGroup:{
      position: 'absolute',
      bottom: `40px`,
      right: '20px',
      border: 'none',
      zIndex:1000,
      '@media (max-width: 900px)': {
        bottom: `0px`,
        top:'140px',
        right: '14px',
      },
    },
}));
