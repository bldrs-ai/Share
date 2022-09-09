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
        cameraControls: {},
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
}
const constructorMock = ifcjsMock.IfcViewerAPI
constructorMock.mockImplementation(() => impl)


/**
 * @return {object} The single mock instance of IfcViewerAPI.
 */
function __getIfcViewerAPIMockSingleton() {
  return impl
}

/**
 * delete all planes mock fucntion
 */
function deleteAllPlanes() {
  console.log('deletePlane ')
}


export {
  ifcjsMock as default,
  constructorMock as IfcViewerAPI,
  __getIfcViewerAPIMockSingleton,
}
