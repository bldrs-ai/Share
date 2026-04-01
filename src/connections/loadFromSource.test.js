import {loadFileById, loadFileFromSource} from './loadFromSource'
import {getBrowser, getProvider} from './registry'


jest.mock('./registry')
jest.mock('../OPFS/utils', () => ({checkOPFSAvailability: jest.fn().mockReturnValue(false)}))
jest.mock('../OPFS/OPFSService.js', () => ({initializeWorker: jest.fn(), opfsWriteModel: jest.fn()}))


const FAKE_BLOB_URL = 'blob:http://localhost/fake-blob-uuid'
const FAKE_BLOB_ID = 'fake-blob-uuid'

const mockConnection = {
  id: 'gdrive-1',
  providerId: 'google-drive',
  label: 'Google Drive',
  status: 'connected',
  createdAt: new Date().toISOString(),
  meta: {},
}

const mockSource = {
  id: 'src-1',
  connectionId: 'gdrive-1',
  providerId: 'google-drive',
  label: 'Models',
  location: {type: 'google-drive', folderId: 'folder-abc', folderName: 'Models'},
  createdAt: new Date().toISOString(),
}

const mockFile = {id: 'file-123', name: 'model.ifc'}

const mockBlob = new Blob(['IFC content'], {type: 'application/octet-stream'})

const mockBrowser = {
  getFileDownload: jest.fn().mockResolvedValue({
    blob: mockBlob,
    filename: 'model.ifc',
    mimeType: 'application/x-step',
    modifiedAt: '2025-01-15T10:30:00Z',
  }),
}

const mockProvider = {
  getAccessToken: jest.fn().mockResolvedValue('test-token'),
}


describe('loadFromSource', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getProvider.mockReturnValue(mockProvider)
    getBrowser.mockReturnValue(mockBrowser)
    global.URL.createObjectURL = jest.fn().mockReturnValue(FAKE_BLOB_URL)
  })


  describe('loadFileFromSource', () => {
    it('calls getFileDownload with connection, source and file id', async () => {
      const onLoad = jest.fn()

      await loadFileFromSource(mockConnection, mockSource, mockFile, onLoad)

      expect(getBrowser).toHaveBeenCalledWith('google-drive')
      expect(mockBrowser.getFileDownload).toHaveBeenCalledWith(mockConnection, mockSource, mockFile.id)
    })

    it('calls onLoad with the blob url filename', async () => {
      const onLoad = jest.fn()

      await loadFileFromSource(mockConnection, mockSource, mockFile, onLoad)

      expect(onLoad).toHaveBeenCalledWith(FAKE_BLOB_ID)
    })

    it('returns modifiedAt from the download result', async () => {
      const result = await loadFileFromSource(mockConnection, mockSource, mockFile, jest.fn())

      expect(result).toEqual({modifiedAt: '2025-01-15T10:30:00Z'})
    })

    it('throws when no provider is registered', async () => {
      getProvider.mockReturnValue(null)

      await expect(
        loadFileFromSource(mockConnection, mockSource, mockFile, jest.fn()),
      ).rejects.toThrow('No provider registered for google-drive')
    })
  })


  describe('loadFileById', () => {
    it('calls getFileDownload with null source', async () => {
      const onLoad = jest.fn()

      await loadFileById(mockConnection, 'file-abc', 'model.ifc', onLoad)

      expect(mockBrowser.getFileDownload).toHaveBeenCalledWith(mockConnection, null, 'file-abc')
    })

    it('calls onLoad with the blob url filename', async () => {
      const onLoad = jest.fn()

      await loadFileById(mockConnection, 'file-abc', 'model.ifc', onLoad)

      expect(onLoad).toHaveBeenCalledWith(FAKE_BLOB_ID)
    })

    it('returns modifiedAt from the download result', async () => {
      const result = await loadFileById(mockConnection, 'file-abc', 'model.ifc', jest.fn())

      expect(result).toEqual({modifiedAt: '2025-01-15T10:30:00Z'})
    })

    it('fetches blob using auth token when download only returns a url', async () => {
      const downloadUrl = new URL('https://storage.googleapis.com/file/model.ifc')
      mockBrowser.getFileDownload.mockResolvedValueOnce({
        blob: null,
        downloadUrl,
        filename: 'model.ifc',
      })
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      })
      const onLoad = jest.fn()

      await loadFileById(mockConnection, 'file-abc', 'model.ifc', onLoad)

      expect(fetch).toHaveBeenCalledWith(downloadUrl.toString(), {
        headers: {Authorization: 'Bearer test-token'},
      })
      expect(onLoad).toHaveBeenCalledWith(FAKE_BLOB_ID)
    })

    it('throws when no provider is registered', async () => {
      getProvider.mockReturnValue(null)

      await expect(
        loadFileById(mockConnection, 'file-abc', 'model.ifc', jest.fn()),
      ).rejects.toThrow('No provider registered for google-drive')
    })
  })
})
