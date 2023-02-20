import {Vector3} from 'three'


jest.mock('../src/Infrastructure/IfcHighlighter')
const ifcjsMock = jest.createMockFromModule('web-ifc-viewer')

// Not sure why this is required, but otherwise these internal fields
// are not present in the instantiated IfcViewerAPI.
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
    loadIfcUrl: jest.fn(jest.fn(() => loadedModel)),
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
        normal: new Vector3(1, 0, 0),
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
  },
  getProperties: jest.fn((modelId, eltId) => {
    return loadedModel.ifcManager.getProperties(eltId)
  }),
  setSelection: jest.fn(),
  pickIfcItemsByID: jest.fn(),
  loadIfcUrl: jest.fn(jest.fn(() => loadedModel)),
}
const constructorMock = ifcjsMock.IfcViewerAPI
constructorMock.mockImplementation(() => impl)


/**
 * @return {object} The single mock instance of IfcViewerAPI.
 */
function __getIfcViewerAPIMockSingleton() {
  return impl
}


export {
  ifcjsMock as default,
  constructorMock as IfcViewerAPI,
  __getIfcViewerAPIMockSingleton,
}
