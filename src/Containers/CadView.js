import React, { useEffect, useState } from 'react';
import { IfcViewerAPI } from 'web-ifc-viewer';
import { makeStyles } from '@material-ui/core/styles';
import SearchIndex from './SearchIndex.js';
import MenuButton from '../Components/MenuButton';
import ItemPanel from '../Components/ItemPanel';
import NavPanel from '../Components/NavPanel';
import SearchBar from '../Components/SearchBar';
import ToolBar from '../Components/ToolBar';
import gtag from '../utils/gtag.js';

import SnackBarMessage from '../Components/SnackbarMessage';
import '../App.css';

const debug = 0;

const useStyles = makeStyles((theme) => ({
  root: {
    ...theme.typography.button,
    backgroundColor: theme.palette.background.paper,
    padding: theme.spacing(1),
    flexGrow: 1,
  },
  menuToolbarContainer: {
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '10px',
    '@media (max-width: 900px)': {
      marginTop: '40px',
    },
  },
  elementsButton: {
    position: 'absolute',
    top: 80,
    right: 20,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    '@media (max-width: 900px)': {
      marginTop: theme.spacing(5),
      top: 520,
      right: 15,
    },
  },
  title: {
    flexGrow: 1,
    color: 'WhiteSmoke',
    fontSize: 20,
    marginRight: '20px',
  },
  shareContainer: {
    width: 540,
    height: 30,
    paddingLeft: 10,
    color: 'aqua',
    border: '1px solid aqua',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'absolute',
    right: 80,
    top: 86,
  },
  searchContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'absolute',
    left: 20,
    top: 84,
  },
  paper: {
    padding: theme.spacing(2),
    display: 'flex',
    overflow: 'auto',
    flexDirection: 'column',
    height: '50px',
    width: '160px',
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
  propertyViewContainer: {
    position: 'absolute',
    top: '100px',
    right: '50px',
    width: '400px',
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
  const [selectedElement, setSelectedElement] = useState({});
  const [selectedElements, setSelectedElements] = useState([]);
  const [expandedElements, setExpandedElements] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState();
  console.log('is Loading', isLoading);
  const onClickShare = () => setShowShare(!showShare);

  const [searchIndex, setSearchIndex] = useState({ clearIndex: () => {} });

  const clearSearch = () => {
    setSelectedElements([]);
    viewer.IFC.unpickIfcItems();
  };

  const selectItems = async (resultIDs) => {
    console.log('in the select items');
    setIsLoading(true);
    setLoadingMessage('Selection in progress');
    setSelectedElements(resultIDs.map((id) => id + ''));
    console.log('selected elements', selectedElements);
    try {
      if (debug >= 2) {
        console.log('picking ifc items: ', resultIDs);
      }
      console.log('in the try method');
      setIsLoading(true);
      await viewer.pickIfcItemsByID(0, resultIDs);
      console.log('after await ');
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
    if (id === undefined)
      throw new Error('Selected element is missing Express ID');
    selectItems([id]);
    const props = await viewer.getProperties(0, elt.expressID);
    setSelectedElement(props);
    setShowItemPanel(true);
  };

  const onModelLoad = (rootElt, viewer) => {
    setRootElement(rootElt);
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
    setExpandedElements(expanded);
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

  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {
    const container = document.getElementById('viewer-container');
    const viewer = new IfcViewerAPI({ container });
    setViewer(viewer);
    // No setWasmPath here. As of 1.0.14, the default is
    // http://localhost:3000/static/js/web-ifc.wasm, so just putting
    // the binary there in our public directory.
    viewer.addAxes();
    viewer.addGrid();
    window.onmousemove = viewer.prepickIfcItem;
    window.ondblclick = viewer.addClippingPlane;
    window.onkeydown = (event) => viewer.removeClippingPlane();

    // Expanded version of viewer.loadIfcUrl('/index.ifc').  Using
    // this to get access to progress and error.
    if (window.location.hash.length > 0) {
      const filePath = './' + window.location.hash.substring(1);
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
    }
  }, []);

  const loadIfc = async (file) => {
    setIsLoading(true);
    setLoadingMessage('model is loading');
    if (debug) {
      console.log(viewer);
    }
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

  let isLoaded = Object.keys(rootElement).length === 0;
  let isLoadedElement = Object.keys(selectedElement).length === 0;

  return (
    <div>
      <div style={{ zIndex: 0 }}>
        <div className={classes.viewContainer} id='viewer-container'></div>
      </div>
      <div
        id='property-viewer-container'
        className={classes.propertyViewContainer}
      ></div>
      <div index={{ zIndex: 100 }}>
        <ToolBar fileOpen={fileOpen} onClickShare={onClickShare} />
        <SnackBarMessage
          message={loadingMessage}
          open={isLoading}
          type={'info'}
        />
        {showSearchBar && (
          <div className={classes.searchContainer}>
            <SearchBar
              onSearch={onSearch}
              onSearchModify={onSearchModify}
              onClickMenu={() => setShowNavPanel(!showNavPanel)}
              disabled={isLoaded}
              open={showNavPanel}
            />
          </div>
        )}
        <div className={classes.elementsButton}>
          <MenuButton
            onClick={() => setShowItemPanel(!showItemPanel)}
            disabled={isLoadedElement}
            open={showItemPanel}
          />
        </div>

        <div className={classes.menuToolbarContainer}>
          <div>
            {showNavPanel ? (
              <NavPanel
                viewer={viewer}
                element={rootElement}
                selectedElements={selectedElements}
                expandedElements={expandedElements}
                onElementSelect={onElementSelect}
              />
            ) : null}
          </div>
          <div>
            {showItemPanel ? (
              <ItemPanel viewer={viewer} element={selectedElement} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CadView;
