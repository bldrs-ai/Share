// Mock the entire module
import * as OpfsService from '../OPFS/OpfsService.js'
import {
  writeSavedGithubModelOpfs,
  getModelFromOpfs,
  downloadToOpfs,
  doesFileExistInOpfs,
  deleteFileFromOpfs,
  checkOpfsAvailability,
} from './utils'


jest.mock('../OPFS/OpfsService.js')

describe('opfs/utils', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Setup or reset mock implementations before each test
    OpfsService.initializeWorker.mockReturnValue({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })
  })

  describe('writeSavedGithubModelOpfs', () => {
    it('should resolve true when worker completes writing file', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate successful worker operation
          process.nextTick(() => handler({data: {completed: true, event: 'write'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OpfsService.initializeWorker.mockReturnValue(mockWorker)
      const result = await writeSavedGithubModelOpfs('mockFile', 'originalFileName', 'commitHash', 'owner', 'repo', 'branch')
      expect(result).toBe(true)
      expect(OpfsService.initializeWorker).toHaveBeenCalled()
      expect(OpfsService.opfsWriteModelFileHandle)
          .toHaveBeenCalledWith('mockFile', 'originalFileName', 'commitHash', 'owner', 'repo', 'branch')
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalled()
    })
  })

  describe('getModelFromOpfs', () => {
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
      OpfsService.initializeWorker.mockReturnValue(mockWorker)

      // Call the function with test data
      const result = await getModelFromOpfs('owner', 'repo', 'branch', 'path/to/file.ifc')

      // Assert the expected outcomes
      expect(result).toEqual(mockFile)
      expect(OpfsService.initializeWorker).toHaveBeenCalled()
      expect(OpfsService.opfsReadModel).toHaveBeenCalledWith('file') // Since you manipulate the filepath in the function
      expect(mockWorker.addEventListener).toHaveBeenCalled()
      expect(mockWorker.removeEventListener).toHaveBeenCalled()
    })
  })

  describe('downloadToOpfs', () => {
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
      OpfsService.initializeWorker.mockReturnValue(mockWorker)

      const onProgressMock = jest.fn()
      const result = await downloadToOpfs(
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
      expect(OpfsService.initializeWorker).toHaveBeenCalled()
      expect(OpfsService.opfsDownloadToOpfs).toHaveBeenCalledWith(
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
            handler({data: {progressEvent: true, contentLength: 100, receivedLength: 50}}) // Simulate a progress update
            handler({data: {completed: true, event: 'download', file: new Blob(['content'])}}) // Then complete
          })
        }),
        removeEventListener: jest.fn(),
      }
      OpfsService.initializeWorker.mockReturnValue(mockWorker)

      const onProgressMock = jest.fn()
      await downloadToOpfs(
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
        contentLength: 100,
        receivedLength: 50,
      })
    })
  })

  describe('doesFileExistInOpfs', () => {
    it('should resolve true if the file exists', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          process.nextTick(() => handler({data: {completed: true, event: 'exist'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OpfsService.initializeWorker.mockReturnValue(mockWorker)

      const result = await doesFileExistInOpfs(
          'originalFilePath',
          'commitHash',
          'owner',
          'repo',
          'branch',
      )

      expect(result).toBe(true)
      expect(OpfsService.initializeWorker).toHaveBeenCalled()
      expect(OpfsService.opfsDoesFileExist).toHaveBeenCalledWith(
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
      OpfsService.initializeWorker.mockReturnValue(mockWorker)

      const result = await doesFileExistInOpfs(
          'originalFilePath',
          'commitHash',
          'owner',
          'repo',
          'branch',
      )

      expect(result).toBe(false)
    })
  })

  describe('deleteFileFromOpfs', () => {
    it('should resolve true if the file was successfully deleted', async () => {
      const mockWorker = {
        addEventListener: jest.fn((_, handler) => {
          // Simulate successful file deletion
          process.nextTick(() => handler({data: {completed: true, event: 'deleted'}}))
        }),
        removeEventListener: jest.fn(),
      }
      OpfsService.initializeWorker.mockReturnValue(mockWorker)

      const result = await deleteFileFromOpfs(
          'originalFilePath',
          'commitHash',
          'owner',
          'repo',
          'branch',
      )

      expect(result).toBe(true)
      expect(OpfsService.initializeWorker).toHaveBeenCalled()
      expect(OpfsService.opfsDeleteModel).toHaveBeenCalledWith(
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
      OpfsService.initializeWorker.mockReturnValue(mockWorker)

      const result = await deleteFileFromOpfs(
          'originalFilePath',
          'commitHash',
          'owner',
          'repo',
          'branch',
      )

      expect(result).toBe(false)
    })
  })

  describe('checkOpfsAvailability', () => {
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

      const result = await checkOpfsAvailability()
      expect(result).toBe(true)
    })


    it('should return false when FileSystemDirectoryHandle is not available', async () => {
      // Ensure FileSystemDirectoryHandle is not defined
      delete global.window.FileSystemDirectoryHandle

      const result = await checkOpfsAvailability()
      expect(result).toBe(false)
    })
  })
})
