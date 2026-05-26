jest.mock('three')
jest.mock('../src/viewer/three/IfcHighlighter')
jest.mock('../src/viewer/three/IfcIsolator')
jest.mock('../src/viewer/three/CustomPostProcessor')
const ifcjsMock = jest.createMockFromModule('web-ifc-viewer')
const ThreeContext = require('../src/viewer/three/ThreeContext').default


// Not sure why this is required, but otherwise these internal fields
// are not present in the instantiated ShareViewer.
const loadedModel = {
  ifcManager: {
    getSpatialStructure: jest.fn(),
    getProperties: jest.fn((eltId) => ({})),
  },
  getIfcType: jest.fn(),
  geometry: {
    boundingBox: {
      getCenter: jest.fn(),
    },
    attributes: {
      expressID: 123,
    },
  },
}

const legacyContextMock = {
  fitToFrame: jest.fn(),
  getCamera: jest.fn(() => {
    return {
      currentNavMode: {
        fitModelToFrame: jest.fn(),
      },
    }
  }),
  getClippingPlanes: jest.fn(() => {
    return []
  }),
  getDomElement: jest.fn(() => ({
    setAttribute: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })),
  getRenderer: jest.fn(),
  getScene: jest.fn(() => {
    return {
      add: jest.fn(),
    }
  }),
  ifcCamera: {
    cameraControls: {
      addEventListener: jest.fn(),
      setPosition: jest.fn((x, y, z) => {
        return {}
      }),
      getPosition: jest.fn((x, y, z) => {
        const position = [0, 0, 0]
        return position
      }),
      setTarget: jest.fn((x, y, z) => {
        return {}
      }),
      getTarget: jest.fn((x, y, z) => {
        const target = [0, 0, 0]
        return target
      }),
    },
    currentNavMode: {
      fitModelToFrame: jest.fn(),
    },
  },
  items: {
    ifcModels: [],
    pickableIfcModels: [],
  },
  mouse: {position: {x: 0, y: 0}},
  renderer: {
    newScreenshot: jest.fn(),
    update: jest.fn(),
  },
  resize: jest.fn(),
  dispose: jest.fn(),
}
// Production wraps `viewer.context` in a ThreeContext (see
// src/viewer/three/ThreeContext.js). Mirror that here so the singleton
// from `__getShareViewerMockSingleton()` exposes the same
// surface as production.
const contextMock = new ThreeContext(legacyContextMock)

const impl = {
  _isMock: true,
  _loadedModel: loadedModel,
  IFC: {
    addIfcModel: jest.fn(),
    // Mirrors production: the fork's IfcManager holds the raw legacy
    // IfcContext; only `viewer.context` is the ThreeContext wrapper.
    context: legacyContextMock,
    setWasmPath: jest.fn(),
    selector: {
      unpickIfcItems: jest.fn(),
      selection: {
        meshes: [],
        material: null,
      },
      preselection: {
        material: null,
      },
    },
    loader: {
      ifcManager: {
        applyWebIfcConfig: jest.fn(),
        ifcAPI: {
          // Slice 5b: Conway-direct parse calls OpenModel +
          // StreamAllMeshes directly. The empty-StreamAllMeshes
          // path produces an empty Conway-direct Mesh, which is
          // enough for unit tests that only verify the load
          // pipeline shape (not the actual geometry).
          OpenModel: jest.fn(() => 0),
          StreamAllMeshes: jest.fn(() => {}),
          GetCoordinationMatrix: jest.fn(() => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
          getConwayVersion: jest.fn(),
          getStatistics: jest.fn(() => {
            return {
              getGeometryMemory: jest.fn(),
              getGeometryTime: jest.fn(),
              getLoadStatus: jest.fn(),
              getOriginatingSystem: jest.fn(),
              getParseTime: jest.fn(),
              getPreprocessorVersion: jest.fn(),
              getTotalTime: jest.fn(),
              getVersion: jest.fn(),
            }
          }),
          // Conway's `properties` namespace — the Conway-direct
          // model methods route reads through here. Stubs return
          // empty so tests that don't probe properties still pass;
          // tests that DO probe should mock per-test.
          properties: {
            getItemProperties: jest.fn(),
            getPropertySets: jest.fn(),
            getSpatialStructure: jest.fn(),
            getIfcType: jest.fn(),
          },
        },
        parser: {},
        setupCoordinationMatrix: jest.fn(),
        state: {},
      },
      parse: jest.fn(() => loadedModel),
    },
  },
  // Mirrors the surface of `viewer/three/Clipper.js` — the unified
  // facade that wraps the fork's `IfcClipper` + the in-repo
  // `GlbClipper`. The methods below are no-op stubs sized to what
  // CutPlaneMenu / viewer.js / shortcutKeys consume.
  clipper: {
    active: false,
    setActive: jest.fn(),
    deleteAllPlanes: jest.fn(() => {
      return 'cutPlane'
    }),
    setInteractionEnabled: jest.fn(),
    setModel: jest.fn(),
    dispose: jest.fn(),
    context: {
      clippingPlanes: [],
    },
    createFromNormalAndCoplanarPoint: jest.fn(() => {
      return 'createFromNormalAndCoplanarPoint'
    }),
    planes: [{
      plane: {
        normal: jest.fn(),
        constant: 10,
      },
    }],
  },
  container: {
    style: {},
  },
  context: contextMock,
  loadIfcUrl: jest.fn(jest.fn(() => loadedModel)),
  loadIfcFile: jest.fn(jest.fn(() => loadedModel)),
  getProperties: jest.fn((modelId, eltId) => {
    return loadedModel.ifcManager.getProperties(eltId)
  }),
  pickIfcItemsByID: jest.fn(),
  preselectElementsByIds: jest.fn(),
  setSelection: jest.fn(),
  setInstanceSelection: jest.fn(),
  setCustomViewSettings: jest.fn(),
  takeScreenshot: jest.fn(),
}
const constructorMock = ifcjsMock.IfcViewerAPI
constructorMock.mockImplementation(() => impl)


/**
 * @return {object} The single mock instance of ShareViewer.
 */
function __getShareViewerMockSingleton() {
  return impl
}


export {
  ifcjsMock as default,
  constructorMock as IfcViewerAPI,
  __getShareViewerMockSingleton as __getShareViewerMockSingleton,
}
