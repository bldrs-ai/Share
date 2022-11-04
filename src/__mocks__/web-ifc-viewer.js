const ifcjsMock = jest.createMockFromModule('web-ifc-viewer')
export default ifcjsMock

const constructorMock = ifcjsMock.IfcViewerAPI
// Not sure why this is required, but otherwise these internal fields
// are not present in the instantiated IfcViewerAPI.
const impl = {
  IFC: {
    context: {
      ifcCamera: {
        cameraControls: {},
      },
    },
    setWasmPath: jest.fn(),
    loadIfcUrl: jest.fn(),
  },
  clipper: {
    active: false,
  },
  context: {
    resize: jest.fn(),
  },
  getProperties: jest.fn(),
}
constructorMock.mockImplementation(() => impl)
export {constructorMock as IfcViewerAPI}
