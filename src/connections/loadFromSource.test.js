import {loadFileById, loadFileFromSource} from './loadFromSource'
import {initializeWorker, nextRequestId} from '../OPFS/OPFSService.js'
import {checkOPFSAvailability} from '../OPFS/utils'
import {getBrowser, getProvider} from './registry'


jest.mock('./registry')
jest.mock('../OPFS/utils', () => ({checkOPFSAvailability: jest.fn().mockReturnValue(false)}))
jest.mock('../OPFS/OPFSService.js', () => ({
  initializeWorker: jest.fn(),
  nextRequestId: jest.fn(),
  opfsWriteModel: jest.fn(),
}))


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


  // The OPFS worker is shared per origin, so this listener sees every reply,
  // not only its own. #1785 correlated the helpers in `OPFS/utils.js`; this
  // call site posts directly and had no filter, which made it strictly worse
  // than before — another request's failure detached it and revoked a blob URL
  // whose write was still in flight, so the upload silently never completed.
  // (codex, PR #1790.)
  describe('loadFileById OPFS write correlation', () => {
    /** @return {object} a worker stub whose messages reach every listener */
    function makeSharedWorker() {
      const listeners = []
      return {
        addEventListener: (_, fn) => listeners.push(fn),
        removeEventListener: (_, fn) => {
          const at = listeners.indexOf(fn)
          if (at !== -1) {
            listeners.splice(at, 1)
          }
        },
        deliver: (data) => listeners.slice().forEach((fn) => fn({data})),
        listenerCount: () => listeners.length,
      }
    }

    let worker

    beforeEach(() => {
      worker = makeSharedWorker()
      checkOPFSAvailability.mockReturnValue(true)
      initializeWorker.mockReturnValue(worker)
      let n = 0
      // A real incrementing id. The automock returns `undefined` for every
      // call, which makes every reply match every listener and would let both
      // tests below pass without the fix.
      nextRequestId.mockImplementation(() => `opfs-${++n}`)
      getProvider.mockReturnValue(mockProvider)
      getBrowser.mockReturnValue(mockBrowser)
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      })
    })

    afterEach(() => {
      checkOPFSAvailability.mockReturnValue(false)
    })

    it('ignores another request\'s error and still completes its own write', async () => {
      const onLoad = jest.fn()
      const pending = loadFileById(mockConnection, 'file-abc', 'model.ifc', onLoad)
      await Promise.resolve()
      await Promise.resolve()

      // Somebody else's failure on the shared worker. Pre-fix this rejected
      // `pending` and revoked our blob URL.
      worker.deliver({requestId: 'opfs-999', error: 'unrelated failure'})
      // Our own write then lands.
      worker.deliver({
        requestId: 'opfs-1', completed: true, event: 'write', fileName: 'stored.ifc',
      })

      await expect(pending).resolves.toBeDefined()
      expect(onLoad).toHaveBeenCalledWith('stored.ifc')
    })

    it('ignores another request\'s write reply rather than resolving on it', async () => {
      const onLoad = jest.fn()
      const pending = loadFileById(mockConnection, 'file-abc', 'model.ifc', onLoad)
      await Promise.resolve()
      await Promise.resolve()

      worker.deliver({
        requestId: 'opfs-999', completed: true, event: 'write', fileName: 'not-ours.ifc',
      })
      expect(onLoad).not.toHaveBeenCalled()
      // Still attached, still waiting for its own reply.
      expect(worker.listenerCount()).toBe(1)

      worker.deliver({
        requestId: 'opfs-1', completed: true, event: 'write', fileName: 'stored.ifc',
      })
      await expect(pending).resolves.toBeDefined()
      expect(onLoad).toHaveBeenCalledWith('stored.ifc')
      expect(worker.listenerCount()).toBe(0)
    })
  })
})
