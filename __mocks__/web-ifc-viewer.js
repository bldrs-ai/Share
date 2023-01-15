import {Vector3} from 'three'


const ifcjsMock = jest.createMockFromModule('web-ifc-viewer')

// Not sure why this is required, but otherwise these internal fields
// are not present in the instantiated IfcViewerAPI.
const loadedModel = {
  ifcManager: {
    getSpatialStructure: jest.fn(),
    getProperties: jest.fn((eltId) => ({})),
  },
  getIfcType: jest.fn(),
}


const impl = {
  _isMock: true,
  _loadedModel: loadedModel,
  IFC: {
    context: {
      ifcCamera: {
        cameraControls: {
          setPosition: (x, y, z) => {
            return {}
          },
          getPosition: (x, y, z) => {
            // eslint-disable-next-line no-magic-numbers
            const position = [0, 0, 0]
            return position
          },
          setTarget: (x, y, z) => {
            return {}
          },
          getTarget: (x, y, z) => {
            // eslint-disable-next-line no-magic-numbers
            const target = [0, 0, 0]
            return target
          },
        },
      },
    },
    loadIfcUrl: jest.fn(jest.fn(() => loadedModel)),
    setWasmPath: jest.fn(),
    unpickIfcItems: jest.fn(),
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
  },
  getProperties: jest.fn((modelId, eltId) => {
    return loadedModel.ifcManager.getProperties(eltId)
  }),
  setSelection: jest.fn(),
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
