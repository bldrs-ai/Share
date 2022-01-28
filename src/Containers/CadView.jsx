import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IfcViewerAPI } from 'web-ifc-viewer';
import { makeStyles } from '@mui/styles';
import SearchIndex from './SearchIndex.js';
import ItemPanelButton from '../Components/ItemPanel';
import NavPanel from '../Components/NavPanel';
import SearchBar from '../Components/SearchBar';
import ToolBar from '../Components/ToolBar';
import IconGroup from '../Components/IconGroup'
import gtag from '../utils/gtag.js';
import SnackBarMessage from '../Components/SnackbarMessage';
import { computeElementPath, setupLookupAndParentLinks } from '../utils/TreeUtils';
import { Color } from 'three';


const debug = 0;
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

const CadView = () => {
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

  const clearSearch = () => {
    setSelectedElements([]);
    viewer.IFC.unpickIfcItems();
  };

  const selectItems = async (resultIDs) => {
    setIsLoading(true);
    setLoadingMessage('Selection in progress');
    setSelectedElements(resultIDs.map((id) => id + ''));
    try {
      if (debug >= 2) {
        console.log('picking ifc items: ', resultIDs);
      }
      setIsLoading(true);
      await viewer.pickIfcItemsByID(0, resultIDs);
      setIsLoading(false);
    } catch (e) {
      // IFCjs will throw a big stack trace if there is not a visual
      // element, e.g. for IfcSite, but we still want to proceed to
      // setup its properties.
      if (debug >= 3) {
        console.error('TODO: no visual element for item ids: ', resultIDs);
      }
    }
  };

  const onSearch = (query) => {
    clearSearch();
    if (debug) {
      console.log(`CadView#onSearch: query: ${query}`);
    }
    query = query.trim();
    if (query === '') {
      return;
    }

    const resultIDs = searchIndex.search(query);
    selectItems(resultIDs);
    gtag('event', 'search', {
      search_term: query,
    });
    setIsLoading(false);
  };

  // TODO(pablo): search suggest
  const onSearchModify = (target) => {};

  const onElementSelect = async (elt) => {
    const id = elt.expressID;
    if (id === undefined) {
      throw new Error('Selected element is missing Express ID');
    }
    selectItems([id]);
    const props = await viewer.getProperties(0, elt.expressID);
    setSelectedElement(props);

    // TODO(pablo): just found out this method is getting called a lot
    // when i added navigation on select, which flooded the browser
    // IPC.

    //const path = computeElementPath(elt, elt => elt.expressID);
    //navigate(path);
    //console.log(elt, ', path: ', path);
    setShowItemPanel(false);
  };

  const onModelLoad = (rootElt, viewer) => {
    setRootElement(rootElt);
    setupLookupAndParentLinks(rootElt, elementsById);
    if (debug >= 2) {
      console.log(
        `CadView#fileOpen: json: '${JSON.stringify(rootElt, null, '  ')}'`
      );
    }
    const expanded = [rootElt.expressID + ''];
    let elt = rootElt;
    for (let i = 0; i < 3; i++) {
      if (elt.children.length > 0) {
        expanded.push(elt.expressID + '');
        elt = elt.children[0];
      }
    }
    setDefaultExpandedElements(expanded);
    setShowNavPanel(true);
    searchIndex.clearIndex();
    const index = new SearchIndex(rootElt, viewer);
    index.indexElement(rootElt);
    // TODO(pablo): why can't i do:
    //   setSearchIndex(new SearchIndex(rootElt, viewer));
    //   searchIndex.indexElement(...);
    // When I try this searchIndex is actually a promise.
    setSearchIndex(index);
    setShowSearchBar(true);
  };

  const navigate = useNavigate();

  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {
    const container = document.getElementById('viewer-container');
    const viewer = new IfcViewerAPI({
      container,
      backgroundColor: new Color('#E0E0E0'),
    });
    setViewer(viewer);
    if (debug) {
      console.log('CadView#useEffect: viewer created: ', viewer);
    }
    // No setWasmPath here. As of 1.0.14, the default is
    // http://localhost:3000/static/js/web-ifc.wasm, so just putting
    // the binary there in our public directory.
    viewer.IFC.setWasmPath('./static/js/');
    viewer.addAxes();
    viewer.addGrid(50, 50);
    viewer.clipper.active = true;

    const handleKeyDown = (event) => {
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

    // Highlight items when hovering over them
    window.onmousemove = viewer.IFC.prePickIfcItem;
    window.onkeydown = handleKeyDown;

    // Select items
    window.ondblclick = async (event) => {
      if (event.target) {
        if (event.target.tagName == 'CANVAS') {
          const item = await viewer.IFC.pickIfcItem(true);
          if (item.modelID === undefined || item.id === undefined) return;
          const path = computeElementPath(elementsById[item.id], elt => elt.expressID);
          navigate(path);
          setSelectedElement(item);
        }
      }
    };

    // Expanded version of viewer.loadIfcUrl('/index.ifc').  Using
    // this to get access to progress and error.
    const parts = window.location.pathname.split(/[-\w\d]+.ifc/);
    const filePath = '/tinyhouse.ifc';
    if (debug) {
      console.log('CadView#useEffect: load from server and hash: ', filePath);
    }
    viewer.IFC.loader.load(
      filePath,
      (model) => {
        if (debug) {
          console.log('CadView#useEffect$onLoad, model: ', model, viewer);
        }
        viewer.IFC.addIfcModel(model);
        const rootEltPromise = model.ifcManager.getSpatialStructure(0, true);
        rootEltPromise.then((rootElt) => {
          onModelLoad(rootElt, viewer);
        });
      },
      (progressEvent) => {
        if (debug) {
          console.log('CadView#useEffect$onProgress', progressEvent);
        }
      },
      (error) => {
        console.error('CadView#useEffect$onError', error);
      }
    );
  }, []);

  const loadIfc = async (file) => {
    setIsLoading(true);
    setLoadingMessage('model is loading');
    await viewer.loadIfc(file, true);

    const rootElt = await viewer.IFC.getSpatialStructure(0, true);
    if (debug) {
      console.log('rootElt: ', rootElt);
    }
    onModelLoad(rootElt, viewer);
    gtag('event', 'select_content', {
      content_type: 'ifc_model',
      item_id: file,
    });
    setIsLoading(false);
  };

  const fileOpen = () => {
    const viewerContainer = document.getElementById('viewer-container');
    const fileInput = document.createElement('input');
    fileInput.setAttribute('type', 'file');
    fileInput.classList.add('file-input');
    fileInput.addEventListener(
      'change',
      (event) => loadIfc(event.target.files[0]),
      false
    );

    viewerContainer.appendChild(fileInput);
    fileInput.click();
  };

  const placeCutPlane = () => {
    viewer.clipper.createPlane();
  };

  const unSelectItem = () => {
    viewer.IFC.unpickIfcItems();
    viewer.clipper.deleteAllPlanes()
  };

  let isLoaded = Object.keys(rootElement).length === 0;

  return (
    <div className={classes.pageContainer}>
      <div className={classes.viewWrapper}>
        <div className={classes.viewContainer} id='viewer-container'></div>
      </div>
      <div className={classes.menusWrapper}>
        <ToolBar
          fileOpen={fileOpen}
          onClickShare={onClickShare}
          offsetTop={PANEL_TOP}/>
        <SnackBarMessage
          message={loadingMessage}
          open={isLoading}
          type={'info'}
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
          />}
        <div className={classes.itemPanelContainer}>
            <ItemPanelButton
              viewer={viewer}
              element={selectedElement}
              close = {()=>setShowItemPanel(false)}
              topOffset = {PANEL_TOP}
              placeCutPlane = {()=>placeCutPlane()}
              unSelectItem = {()=>unSelectItem()}
              toggleShortCutsPanel = {()=>setShowShortCuts(!showShortCuts)}/>
        </div>
        <div className={classes.iconGroup}>
          <IconGroup
            placeCutPlane = {()=>placeCutPlane()}
            unSelectItem = {()=>unSelectItem()}
            toggleShortCutsPanel = {()=>setShowShortCuts(!showShortCuts)}
          />
        </div>
      </div>
    </div>
  );
};

export default CadView;
