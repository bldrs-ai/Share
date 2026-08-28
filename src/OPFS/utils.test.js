// Mock the entire module
import * as OPFSService from '../OPFS/OPFSService.js'
import {
  writeSavedGithubModelOPFS,
  getModelFromOPFS,
  downloadToOPFS,
  downloadModel,
  doesFileExistInOPFS,
  deleteFileFromOPFS,
  checkOPFSAvailability,
  readModelByPathFromOPFS,
  snapshotOPFS,
  writeGlbBytesToOPFS,
  clearOPFSCache} from './utils'


jest.mock('../OPFS/OPFSService.js')


/**
 * The id `workerRequest` minted for the request currently under test. The real
 * worker stamps it on every reply (`OPFS.worker.js` `postReply`), so a mock
 * worker must too — a reply without it is, correctly, ignored.
 *
 * @return {string}
 */
function currentRequestId() {
  const results = OPFSService.nextRequestId.mock.results
  return results[results.length - 1].value
}


/**
 * Stand-in for the shared OPFS worker: ONE message stream that every in-flight
 * request's listener sees. That sharing is the whole subject of #1785, so the
 * concurrency tests need a worker that models it rather than one listener per
 * mock.
 *
 * @return {object} Mock worker with a `deliver` to post one reply to all
 *   attached listeners and `listenerCount` to check for leaks.
 */
function makeSharedWorkerMock() {
  const listeners = []
  return {
    addEventListener: jest.fn((_, handler) => listeners.push(handler)),
    removeEventListener: jest.fn((_, handler) => {
      const index = listeners.indexOf(handler)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }),
    deliver: (data) => listeners.slice().forEach((handler) => handler({data})),
    listenerCount: () => listeners.length,
  }
}


/**
 * Let queued promise callbacks run so a pending-vs-settled check is meaningful.
 *
 * @return {Promise<void>}
 */
const flushMicrotasks = () => new Promise((resolve) => process.nextTick(resolve))


describe('OPFS Test Suite', () => {
  let consoleWarnMock

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Mock console.warn to prevent console output and capture warnings
    consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation(() => {})

    // Distinct ids per request, as the real `nextRequestId` mints. Without this
    // the automock returns undefined for every call and every reply would match
    // every listener — i.e. exactly the pre-#1785 behavior, which would make
    // the correlation tests below vacuous.
    let requestCounter = 0
    OPFSService.nextRequestId.mockImplementation(() => {
      requestCounter++
      return `opfs-${requestCounter}`
    })

    // Setup or reset mock implementations before each test
    OPFSService.initializeWorker.mockReturnValue({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })
  })

  afterEach(() => {
    // Restore console.warn after each test
    consoleWarnMock.mockRestore()
  })

  describe('writeSavedGithubModelOPFS', () => {
    it('should resolve true when worker completes writing file', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate successful worker operation
          process.nextTick(() => handler({data: {requestId: currentRequestId(), completed: true, event: 'write'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)
      const result = await writeSavedGithubModelOPFS('mockFile', 'originalFileName', 'commitHash', 'owner', 'repo', 'branch')
      expect(result).toBe(true)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      expect(OPFSService.opfsWriteModelFileHandle)
        .toHaveBeenCalledWith('mockFile', 'originalFileName', 'commitHash', 'owner', 'repo', 'branch', 'opfs-1')
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalled()

      // Verify no console warnings were triggered for this operation
      expect(consoleWarnMock).not.toHaveBeenCalled()
    })
  })

  describe('getModelFromOPFS', () => {
    it('should resolve with file when worker completes retrieving file', async () => {
      // Create a mock file as the expected result
      const mockFile = new Blob(['dummy content'], {type: 'text/plain'})
      const mockFileResponse = {completed: true, file: mockFile}

      // Set up the mock worker behavior
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate worker successfully retrieving the file
          process.nextTick(() => handler({data: {...mockFileResponse, requestId: currentRequestId()}}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      // Call the function with test data
      const result = await getModelFromOPFS('owner', 'repo', 'branch', 'path/to/file.ifc')

      // Assert the expected outcomes
      expect(result).toEqual(mockFile)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      // Filepath is reduced to its last segment by the function under test.
      expect(OPFSService.opfsReadModel).toHaveBeenCalledWith('file.ifc', 'opfs-1')
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalled()
    })
  })

  describe('downloadToOPFS', () => {
    it('should resolve with file when download completes', async () => {
      const mockFile = new Blob(['dummy content'], {type: 'application/octet-stream'})
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => {
            handler({data: {requestId: currentRequestId(), completed: true, event: 'download', file: mockFile}})
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const onProgressMock = jest.fn()
      const result = await downloadToOPFS(
        'objectUrl',
        'originalFilePath',
        'commitHash',
        'owner',
        'repo',
        'branch',
        onProgressMock,
      )

      expect(result).toEqual(mockFile)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      expect(OPFSService.opfsDownloadToOPFS).toHaveBeenCalledWith(
        'objectUrl',
        'commitHash',
        'originalFilePath',
        'owner',
        'repo',
        'branch',
        true, // Since onProgress is provided
        'opfs-1',
      )
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1) // Ensure it's called to clean up
    })

    it('should call onProgress with progress data', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => {
            // A progress update, then the terminal event.
            handler({data: {requestId: currentRequestId(), progressEvent: true, total: 100, loaded: 50}})
            handler({data: {
              requestId: currentRequestId(), completed: true, event: 'download', file: new Blob(['content']),
            }})
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const onProgressMock = jest.fn()
      await downloadToOPFS(
        'objectUrl',
        'originalFilePath',
        'commitHash',
        'owner',
        'repo',
        'branch',
        onProgressMock,
      )

      expect(onProgressMock).toHaveBeenCalledWith({
        lengthComputable: true,
        total: 100,
        loaded: 50,
      })
    })
  })

  describe('downloadModel', () => {
    it('should resolve with file when download completes', async () => {
      const mockFile = new File(['dummy content'], 'model.ifc', {type: 'application/octet-stream'})
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => {
            handler({data: {requestId: currentRequestId(), completed: true, event: 'exists', file: mockFile}})
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const onProgressMock = jest.fn()
      const setOPFSFile = jest.fn()
      const result = await downloadModel(
        'objectUrl',
        'shaHash',
        'originalFilePath',
        'accessToken',
        'owner',
        'repo',
        'branch',
        setOPFSFile,
        onProgressMock,
      )

      expect(result).toEqual(mockFile)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      expect(OPFSService.opfsDownloadModel).toHaveBeenCalledWith(
        'objectUrl',
        'shaHash',
        'originalFilePath',
        'owner',
        'repo',
        'branch',
        'accessToken',
        true, // Since onProgress is provided
        'opfs-1',
      )
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1) // Ensure it's called to clean up
    })

    it('should call onProgress with progress data', async () => {
      // The worker now emits exactly one terminal completed event per call
      // (`renamed`, `exists`, or — fallback — `download`). Progress events
      // arrive before that as `progressEvent: true` messages.
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => {
            handler({data: {requestId: currentRequestId(), progressEvent: true, contentLength: 100, receivedLength: 50}})
            handler({data: {requestId: currentRequestId(), completed: true, event: 'renamed', file: new File(['content'], 'model.ifc')}})
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const onProgressMock = jest.fn()
      const setOPFSFile = jest.fn()
      await downloadModel(
        'objectUrl',
        'shaHash',
        'originalFilePath',
        'accessToken',
        'owner',
        'repo',
        'branch',
        setOPFSFile,
        onProgressMock,
      )

      expect(onProgressMock).toHaveBeenCalledWith({
        lengthComputable: true,
        contentLength: 100,
        receivedLength: 50,
      })
    })

    it('calls onLastModifiedGithub when exists event carries the date', async () => {
      const EPOCH_MS = 1663842627000
      const mockFile = new File(['content'], 'model.ifc', {type: 'application/octet-stream'})
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => {
            handler({data: {requestId: currentRequestId(), completed: true, event: 'exists', file: mockFile, lastModifiedGithub: EPOCH_MS}})
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const onLastModifiedGithub = jest.fn()
      await downloadModel(
        'objectUrl', 'shaHash', 'originalFilePath', 'accessToken',
        'owner', 'repo', 'branch', jest.fn(), jest.fn(), onLastModifiedGithub,
      )

      expect(onLastModifiedGithub).toHaveBeenCalledWith(EPOCH_MS)
    })

    it('calls onLastModifiedGithub from a single renamed event', async () => {
      // Replaces the old `download` + `renamed` two-event test. The worker's
      // new contract is a single terminal event; if rename succeeded the
      // commit date rides on the `renamed` message directly.
      const EPOCH_MS = 1663842627000
      const mockFile = new File(['content'], 'model.ifc', {type: 'application/octet-stream'})
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => {
            handler({data: {
              requestId: currentRequestId(), completed: true, event: 'renamed', file: mockFile, lastModifiedGithub: EPOCH_MS,
            }})
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const onLastModifiedGithub = jest.fn()
      await downloadModel(
        'objectUrl', 'shaHash', 'originalFilePath', 'accessToken',
        'owner', 'repo', 'branch', jest.fn(), jest.fn(), onLastModifiedGithub,
      )

      expect(onLastModifiedGithub).toHaveBeenCalledWith(EPOCH_MS)
      expect(onLastModifiedGithub).toHaveBeenCalledTimes(1)
    })

    it('resolves with the file even when only a download event arrives (commit-hash fallback)', async () => {
      // Fallback path: commits API or rename failed, worker posted `download`
      // as the terminal event with the un-renamed handle. Promise should
      // resolve normally so the load doesn't hang.
      const mockFile = new File(['content'], 'model.ifc', {type: 'application/octet-stream'})
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => {
            handler({data: {requestId: currentRequestId(), completed: true, event: 'download', file: mockFile}})
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const setOPFSFile = jest.fn()
      const result = await downloadModel(
        'objectUrl', 'shaHash', 'originalFilePath', 'accessToken',
        'owner', 'repo', 'branch', setOPFSFile, jest.fn(),
      )

      expect(result).toBe(mockFile)
      expect(setOPFSFile).toHaveBeenCalledWith(mockFile)
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1)
    })

    it('does not call onLastModifiedGithub when no date in message', async () => {
      const mockFile = new File(['content'], 'model.ifc', {type: 'application/octet-stream'})
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => {
            handler({data: {requestId: currentRequestId(), completed: true, event: 'exists', file: mockFile}})
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const onLastModifiedGithub = jest.fn()
      await downloadModel(
        'objectUrl', 'shaHash', 'originalFilePath', 'accessToken',
        'owner', 'repo', 'branch', jest.fn(), jest.fn(), onLastModifiedGithub,
      )

      expect(onLastModifiedGithub).not.toHaveBeenCalled()
    })
  })

  describe('doesFileExistInOPFS', () => {
    it('should resolve true if the file exists', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => handler({data: {requestId: currentRequestId(), completed: true, event: 'exist'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const result = await doesFileExistInOPFS(
        'originalFilePath',
        'commitHash',
        'owner',
        'repo',
        'branch',
      )

      expect(result).toBe(true)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      expect(OPFSService.opfsDoesFileExist).toHaveBeenCalledWith(
        'originalFilePath',
        'commitHash',
        'owner',
        'repo',
        'branch',
        'opfs-1',
      )
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1) // Ensure it's called to clean up
    })

    it('should resolve false if the file does not exist', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => handler({data: {requestId: currentRequestId(), completed: true, event: 'notexist'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const result = await doesFileExistInOPFS(
        'originalFilePath',
        'commitHash',
        'owner',
        'repo',
        'branch',
      )

      expect(result).toBe(false)
    })
  })

  describe('deleteFileFromOPFS', () => {
    it('should resolve true if the file was successfully deleted', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate successful file deletion
          process.nextTick(() => handler({data: {requestId: currentRequestId(), completed: true, event: 'deleted'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const result = await deleteFileFromOPFS(
        'originalFilePath',
        'commitHash',
        'owner',
        'repo',
        'branch',
      )

      expect(result).toBe(true)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      expect(OPFSService.opfsDeleteModel).toHaveBeenCalledWith(
        'originalFilePath',
        'commitHash',
        'owner',
        'repo',
        'branch',
        'opfs-1',
      )
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1)
    })

    it('should resolve false if the file does not exist', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate the file not existing
          process.nextTick(() => handler({data: {requestId: currentRequestId(), completed: true, event: 'notexist'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const result = await deleteFileFromOPFS(
        'originalFilePath',
        'commitHash',
        'owner',
        'repo',
        'branch',
      )

      expect(result).toBe(false)
    })
  })

  describe('checkOPFSAvailability', () => {
    // Backup original window object
    const originalWindow = global.window

    beforeEach(() => {
      // Ensure a clean slate for window before each test
      delete global.window.FileSystemDirectoryHandle
    })

    afterAll(() => {
      // Restore original window object
      global.window = originalWindow
    })

    it('should return true when FileSystemDirectoryHandle is available', async () => {
      // Ensure FileSystemDirectoryHandle is available
      global.window.FileSystemDirectoryHandle = {}

      // Mock navigator.storage.getDirectory to simulate a successful call
      const mockGetDirectory = jest.fn()
      global.navigator.storage = {
        getDirectory: mockGetDirectory,
      }
      mockGetDirectory.mockResolvedValue({}) // Simulate successful directory access

      const result = await checkOPFSAvailability()
      expect(result).toBe(true)
    })


    it('should return false when FileSystemDirectoryHandle is not available', async () => {
      // Ensure FileSystemDirectoryHandle is not defined
      delete global.window.FileSystemDirectoryHandle

      const result = await checkOPFSAvailability()
      expect(result).toBe(false)
    })
  })

  describe('snapshotOPFS', () => {
    it('should resolve true if the snapshot was retrieved', async () => {
      const mockDirectoryStructure = 'mock-directory-structure'
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate successful snapshot operation
          process.nextTick(() => handler({data: {
            requestId: currentRequestId(), completed: true, event: 'snapshot', directoryStructure: mockDirectoryStructure,
          }}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const result = await snapshotOPFS()

      expect(result).toBe(true)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1)

      // Assert that console.warn was called with the expected directory structure
      expect(consoleWarnMock).toHaveBeenCalledWith(`OPFS Directory Structure:\n${mockDirectoryStructure}`)
    })
  })

  describe('clearOPFS', () => {
    it('should resolve true if the OPFS cache was cleared', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate successful cache clear operation
          process.nextTick(() => handler({data: {requestId: currentRequestId(), completed: true, event: 'clear'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const result = await clearOPFSCache()

      expect(result).toBe(true)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1)

      // Assert that console.warn was called with the expected cache clear message
      expect(consoleWarnMock).toHaveBeenCalledWith('OPFS cache cleared.')
    })
  })

  // Everything above drives ONE request at a time, which is exactly why the
  // #1785 bug survived: with a single listener attached, "resolved on some
  // reply" is indistinguishable from "resolved on its own reply". These tests
  // overlap two requests on the one shared worker so the difference is
  // observable — each asserts that a promise stays pending while the OTHER
  // request's reply goes by.
  describe('reply correlation on the shared worker (#1785)', () => {
    let sharedWorker

    beforeEach(() => {
      sharedWorker = makeSharedWorkerMock()
      OPFSService.initializeWorker.mockReturnValue(sharedWorker)
    })

    /**
     * Ids in mint order: the first request to call `nextRequestId` is index 0.
     *
     * @param {number} index
     * @return {string}
     */
    const requestIdAt = (index) => OPFSService.nextRequestId.mock.results[index].value

    it('a concurrent write of the SAME model at the SAME commit resolves only its own promise', async () => {
      // The case `commitHash` correlation cannot cover: both requests carry
      // identical (path, commitHash), so only a per-request id separates them.
      const first = writeGlbBytesToOPFS(new Uint8Array([1]), 'model.ifc', 'sha1', 'owner', 'repo', 'main')
      const second = writeGlbBytesToOPFS(new Uint8Array([2]), 'model.ifc', 'sha1', 'owner', 'repo', 'main')
      let firstSettled = false
      first.then(() => {
        firstSettled = true
      })
      expect(sharedWorker.listenerCount()).toBe(2)

      sharedWorker.deliver({requestId: requestIdAt(1), completed: true, event: 'wrote', commitHash: 'sha1'})
      await expect(second).resolves.toBe(true)
      await flushMicrotasks()

      expect(firstSettled).toBe(false)
      expect(sharedWorker.listenerCount()).toBe(1)

      sharedWorker.deliver({requestId: requestIdAt(0), completed: true, event: 'wrote', commitHash: 'sha1'})
      await expect(first).resolves.toBe(true)
      expect(sharedWorker.listenerCount()).toBe(0)
    })

    it('an unrelated request\'s error does not reject the write', async () => {
      // Worker error replies carry no commitHash at all, so this branch has
      // nothing but the request id to match on.
      const write = writeGlbBytesToOPFS(new Uint8Array([1]), 'model.ifc', 'sha1', 'owner', 'repo', 'main')
      const read = readModelByPathFromOPFS('other.glb', 'sha2', 'owner', 'repo', 'main')
      let writeSettled = false
      write.then(() => {
        writeSettled = true
      }, () => {
        writeSettled = true
      })

      sharedWorker.deliver({requestId: requestIdAt(1), error: 'readModelByPath: boom'})
      await expect(read).rejects.toThrow('readModelByPath: boom')
      await flushMicrotasks()

      expect(writeSettled).toBe(false)

      sharedWorker.deliver({requestId: requestIdAt(0), completed: true, event: 'wrote', commitHash: 'sha1'})
      await expect(write).resolves.toBe(true)
    })

    it('two concurrent reads each resolve with their own file', async () => {
      const fileA = new File(['a'], 'a.glb')
      const fileB = new File(['b'], 'b.glb')
      const readA = readModelByPathFromOPFS('a.ifc', 'shaA', 'owner', 'repo', 'main')
      const readB = readModelByPathFromOPFS('b.ifc', 'shaB', 'owner', 'repo', 'main')

      // Reply out of order — the worker gives no ordering guarantee between
      // requests, and ordering is what an uncorrelated listener silently relies on.
      sharedWorker.deliver({requestId: requestIdAt(1), completed: true, event: 'read', file: fileB})
      sharedWorker.deliver({requestId: requestIdAt(0), completed: true, event: 'read', file: fileA})

      // Compare by name, not identity: a failing `toBe` on two jsdom Files
      // makes Jest deep-copy them to build a diff, which aborts the worker.
      expect((await readA).name).toBe('a.glb')
      expect((await readB).name).toBe('b.glb')
    })

    it('does not forward another request\'s progress events', async () => {
      const onProgress = jest.fn()
      const setOpfsFile = jest.fn()
      const download = downloadModel(
        'objectUrl', 'shaHash', 'model.ifc', 'accessToken',
        'owner', 'repo', 'main', setOpfsFile, onProgress)
      const otherWrite = writeGlbBytesToOPFS(new Uint8Array([1]), 'other.ifc', 'sha2', 'owner', 'repo', 'main')

      sharedWorker.deliver({requestId: requestIdAt(1), progressEvent: true, contentLength: 100, receivedLength: 50})
      await flushMicrotasks()

      expect(onProgress).not.toHaveBeenCalled()

      sharedWorker.deliver({requestId: requestIdAt(0), progressEvent: true, contentLength: 100, receivedLength: 50})
      expect(onProgress).toHaveBeenCalledTimes(1)

      // Settle both so neither promise outlives the test.
      const file = new File(['x'], 'model.ifc')
      sharedWorker.deliver({requestId: requestIdAt(0), completed: true, event: 'renamed', file: file})
      sharedWorker.deliver({requestId: requestIdAt(1), completed: true, event: 'wrote', commitHash: 'sha2'})
      await Promise.all([download, otherWrite])
    })

    it('ignores an uncorrelated reply, the shape the worker posted before the fix', async () => {
      const write = writeGlbBytesToOPFS(new Uint8Array([1]), 'model.ifc', 'sha1', 'owner', 'repo', 'main')
      let settled = false
      write.then(() => {
        settled = true
      })

      sharedWorker.deliver({completed: true, event: 'wrote', commitHash: 'sha1'})
      await flushMicrotasks()

      expect(settled).toBe(false)
      expect(sharedWorker.listenerCount()).toBe(1)

      sharedWorker.deliver({requestId: requestIdAt(0), completed: true, event: 'wrote', commitHash: 'sha1'})
      await expect(write).resolves.toBe(true)
    })

    it('detaches and rejects when the worker finishes a request without replying', async () => {
      // The leak asked about in #1785: a listener whose reply never arrives sat
      // on the shared worker for the life of the page. The worker now closes
      // every request out (`requestFinished`) so this can't happen.
      const write = writeGlbBytesToOPFS(new Uint8Array([1]), 'model.ifc', 'sha1', 'owner', 'repo', 'main')
      expect(sharedWorker.listenerCount()).toBe(1)

      sharedWorker.deliver({requestId: requestIdAt(0), requestFinished: true})

      await expect(write).rejects.toThrow(/without a reply/)
      expect(sharedWorker.listenerCount()).toBe(0)
    })

    it('a request that already replied ignores its own requestFinished sentinel', async () => {
      const write = writeGlbBytesToOPFS(new Uint8Array([1]), 'model.ifc', 'sha1', 'owner', 'repo', 'main')

      sharedWorker.deliver({requestId: requestIdAt(0), completed: true, event: 'wrote', commitHash: 'sha1'})
      sharedWorker.deliver({requestId: requestIdAt(0), requestFinished: true})

      await expect(write).resolves.toBe(true)
      expect(sharedWorker.listenerCount()).toBe(0)
    })
  })
})
