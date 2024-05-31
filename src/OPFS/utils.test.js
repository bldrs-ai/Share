// Mock the entire module
import * as OPFSService from '../OPFS/OPFSService.js'
import {
  writeSavedGithubModelOPFS,
  getModelFromOPFS,
  downloadToOPFS,
  doesFileExistInOPFS,
  deleteFileFromOPFS,
  checkOPFSAvailability} from './utils'


jest.mock('../OPFS/OPFSService.js')

describe('OPFS Test Suite', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Setup or reset mock implementations before each test
    OPFSService.initializeWorker.mockReturnValue({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })
  })

  describe('writeSavedGithubModelOPFS', () => {
    it('should resolve true when worker completes writing file', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate successful worker operation
          process.nextTick(() => handler({data: {completed: true, event: 'write'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)
      const result = await writeSavedGithubModelOPFS('mockFile', 'originalFileName', 'commitHash', 'owner', 'repo', 'branch')
      expect(result).toBe(true)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      expect(OPFSService.opfsWriteModelFileHandle)
          .toHaveBeenCalledWith('mockFile', 'originalFileName', 'commitHash', 'owner', 'repo', 'branch')
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalled()
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
          process.nextTick(() => handler({data: mockFileResponse}))
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      // Call the function with test data
      const result = await getModelFromOPFS('owner', 'repo', 'branch', 'path/to/file.ifc')

      // Assert the expected outcomes
      expect(result).toEqual(mockFile)
      expect(OPFSService.initializeWorker).toHaveBeenCalled()
      expect(OPFSService.opfsReadModel).toHaveBeenCalledWith('file') // Since you manipulate the filepath in the function
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
            handler({data: {completed: true, event: 'download', file: mockFile}})
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const onProgressMock = jest.fn()
      const result = await downloadToOPFS(
          // eslint-disable-next-line no-empty-function
          () => {}, // navigate
          'appPrefix',
          // eslint-disable-next-line no-empty-function
          () => {}, // handleBeforeUnload
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
      )
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1) // Ensure it's called to clean up
    })

    it('should call onProgress with progress data', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => {
            handler({data: {progressEvent: true, total: 100, loaded: 50}}) // Simulate a progress update
            handler({data: {completed: true, event: 'download', file: new Blob(['content'])}}) // Then complete
          })
        }),
        removeEventListener: jest.fn(),
      }
      OPFSService.initializeWorker.mockReturnValue(mockWorker)

      const onProgressMock = jest.fn()
      await downloadToOPFS(
          // eslint-disable-next-line no-empty-function
          () => {}, // navigate
          'appPrefix',
          // eslint-disable-next-line no-empty-function
          () => {}, // handleBeforeUnload
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

  describe('doesFileExistInOPFS', () => {
    it('should resolve true if the file exists', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => handler({data: {completed: true, event: 'exist'}}))
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
      )
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1) // Ensure it's called to clean up
    })

    it('should resolve false if the file does not exist', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => handler({data: {completed: true, event: 'notexist'}}))
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
          process.nextTick(() => handler({data: {completed: true, event: 'deleted'}}))
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
      )
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalledTimes(1)
    })

    it('should resolve false if the file does not exist', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate the file not existing
          process.nextTick(() => handler({data: {completed: true, event: 'notexist'}}))
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
})
