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
    context: {
      getCamera: jest.fn(),
      getRenderer: jest.fn(),
      getScene: jest.fn(),
      ifcCamera: {
        cameraControls: {
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
        parser: {},
      },
    },
  },
  clipper: {
    active: false,
    deleteAllPlanes: jest.fn(() => {
      return 'cutPlane'
    }),
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
    resize: jest.fn(),
    getRenderer: jest.fn(),
    getScene: jest.fn(),
    getCamera: jest.fn(),
    getClippingPlanes: jest.fn(() => {
      return []
    }),
  },
  loadIfcUrl: jest.fn(jest.fn(() => loadedModel)),
  getProperties: jest.fn((modelId, eltId) => {
    return loadedModel.ifcManager.getProperties(eltId)
  }),
  setSelection: jest.fn(),
  pickIfcItemsByID: jest.fn(),
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
