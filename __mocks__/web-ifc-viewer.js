jest.mock('three')
jest.mock('../src/Infrastructure/IfcHighlighter')
jest.mock('../src/Infrastructure/IfcIsolator')
jest.mock('../src/Infrastructure/CustomPostProcessor')
const ifcjsMock = jest.createMockFromModule('web-ifc-viewer')


// Not sure why this is required, but otherwise these internal fields
// are not present in the instantiated IfcViewerAPIExtended.
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


const impl = {
  _isMock: true,
  _loadedModel: loadedModel,
  IFC: {
    addIfcModel: jest.fn(),
    context: {
      fitToFrame: jest.fn(),
      getCamera: jest.fn(),
      getRenderer: jest.fn(),
      getScene: jest.fn(),
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
      },
    },
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
  context: {
    getRenderer: jest.fn(),
    getScene: jest.fn(() => {
      return {
        add: jest.fn(),
      }
    }),
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
    renderer: {
      newScreenshot: jest.fn(),
    },
    resize: jest.fn(),
  },
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
 * @return {object} The single mock instance of IfcViewerAPI.
 */
function __getIfcViewerAPIExtendedMockSingleton() {
  return impl
}


export {
  ifcjsMock as default,
  constructorMock as IfcViewerAPI,
  __getIfcViewerAPIExtendedMockSingleton as __getIfcViewerAPIExtendedMockSingleton,
}
