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
          GetCoordinationMatrix: jest.fn(),
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
        },
        parser: {},
        setupCoordinationMatrix: jest.fn(),
        state: {},
      },
      parse: jest.fn(() => loadedModel),
    },
  },
  clipper: {
    active: false,
    setActive: jest.fn(),
    deleteAllPlanes: jest.fn(() => {
      return 'cutPlane'
    }),
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
