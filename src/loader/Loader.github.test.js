import {load} from './Loader'


jest.mock('../OPFS/utils', () => ({
  ...jest.requireActual('../OPFS/utils'),
  downloadModel: jest.fn(),
  doesFileExistInOPFS: jest.fn(),
  writeBase64Model: jest.fn(),
  getModelFromOPFS: jest.fn(),
  downloadToOPFS: jest.fn(),
}))

jest.mock('../connections/persistence', () => ({
  ...jest.requireActual('../connections/persistence'),
  updateRecentFileLastModified: jest.fn(),
}))

jest.mock('./urls', () => ({
  dereferenceAndProxyDownloadContents: jest.fn(),
}))


import * as OPFSUtils from '../OPFS/utils'
import {updateRecentFileLastModified} from '../connections/persistence'
import {dereferenceAndProxyDownloadContents} from './urls'


const EPOCH_MS = 1663842627000
const MOCK_BLOB_AB = new ArrayBuffer(0)


/**
 * @return {object}
 */
function makeMockViewer() {
  return {
    IFC: {
      type: 'ifc',
      addIfcModel: jest.fn(),
      loader: {
        parse: jest.fn().mockResolvedValue({
          modelID: 0,
          loadStats: {},
          children: [],
          geometry: undefined,
          isObject3D: true,
        }),
        ifcManager: {
          state: {models: []},
          applyWebIfcConfig: jest.fn().mockResolvedValue(),
          parse: jest.fn().mockResolvedValue({
            modelID: 0,
            loadStats: {},
            children: [],
            geometry: undefined,
            isObject3D: true,
          }),
          setupCoordinationMatrix: jest.fn(),
          ifcAPI: {
            GetCoordinationMatrix: jest.fn().mockResolvedValue([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
            getStatistics: jest.fn().mockReturnValue({
              getGeometryMemory: jest.fn().mockReturnValue(1024), // eslint-disable-line no-magic-numbers
              getGeometryTime: jest.fn().mockReturnValue(100), // eslint-disable-line no-magic-numbers
              getVersion: jest.fn().mockReturnValue('IFC4'),
              getLoadStatus: jest.fn().mockReturnValue('SUCCESS'),
              getOriginatingSystem: jest.fn().mockReturnValue('Test'),
              getPreprocessorVersion: jest.fn().mockReturnValue('1.0'),
              getParseTime: jest.fn().mockReturnValue(50), // eslint-disable-line no-magic-numbers
              getTotalTime: jest.fn().mockReturnValue(150), // eslint-disable-line no-magic-numbers
            }),
            getConwayVersion: jest.fn().mockReturnValue('1.0.0'),
          },
        },
      },
      context: {
        items: {ifcModels: []},
        fitToFrame: jest.fn(),
      },
    },
  }
}


describe('Loader GitHub lastModifiedGithub integration', () => {
  let mockViewer

  beforeEach(() => {
    jest.clearAllMocks()
    mockViewer = makeMockViewer()

    // Fake blob that returns empty array buffer for model parsing
    const mockFile = Object.assign(
      new Blob([''], {type: 'application/octet-stream'}),
      {arrayBuffer: jest.fn().mockResolvedValue(MOCK_BLOB_AB)},
    )

    // downloadModel calls onLastModifiedGithub synchronously then resolves
    OPFSUtils.downloadModel.mockImplementation(
      (_url, _sha, _fp, _token, _owner, _repo, _branch, _setFile, _onProgress, onLastModifiedGithub) => {
        if (onLastModifiedGithub) {
          onLastModifiedGithub(EPOCH_MS)
        }
        return Promise.resolve(mockFile)
      },
    )

    OPFSUtils.doesFileExistInOPFS.mockResolvedValue(true)

    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://github.com/owner/repo/raw/main/model.ifc',
      'sha123',
      false,
      false,
    ])
  })

  it('calls updateRecentFileLastModified with correct sharePath and epoch ms', async () => {
    await load(
      'https://github.com/owner/repo/main/model.ifc',
      mockViewer,
      jest.fn(),
      true,
      jest.fn(),
      'token123',
    )

    expect(updateRecentFileLastModified).toHaveBeenCalledWith(
      '/share/v/gh/owner/repo/main/model.ifc',
      EPOCH_MS,
    )
  })

  it('does not call updateRecentFileLastModified when onLastModifiedGithub is not fired', async () => {
    OPFSUtils.downloadModel.mockImplementation(
      (_url, _sha, _fp, _token, _owner, _repo, _branch, _setFile, _onProgress, _onLastModifiedGithub) =>
        Promise.resolve(
          Object.assign(
            new Blob([''], {type: 'application/octet-stream'}),
            {arrayBuffer: jest.fn().mockResolvedValue(MOCK_BLOB_AB)},
          ),
        ),
    )

    await load(
      'https://github.com/owner/repo/main/model.ifc',
      mockViewer,
      jest.fn(),
      true,
      jest.fn(),
      'token123',
    )

    expect(updateRecentFileLastModified).not.toHaveBeenCalled()
  })
})
