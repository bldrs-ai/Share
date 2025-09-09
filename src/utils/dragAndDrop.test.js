import {handleFileDrop, handleDragOverOrEnter, handleDragLeave} from './dragAndDrop'
import {guessTypeFromFile} from '../Filetype'
import {saveDnDFileToOpfs} from '../OPFS/utils'
import {disablePageReloadApprovalCheck} from './event'
import {saveDnDFileToOpfsFallback} from './loader'
import {trackAlert} from './alertTracking'
import debug from './debug'


// Mock all dependencies
jest.mock('../Filetype')
jest.mock('../OPFS/utils')
jest.mock('./event')
jest.mock('./loader')
jest.mock('./alertTracking')
jest.mock('./debug')

const mockDebug = {
  log: jest.fn(),
}
debug.mockReturnValue(mockDebug)


describe('dragAndDrop utility', () => {
  let mockEvent
  let mockNavigate
  let mockSetAlert
  let mockOnSuccess
  let mockOnError
  let mockSetIsDragActive

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock event object
    mockEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      dataTransfer: {
        files: [],
      },
    }

    // Mock functions
    mockNavigate = jest.fn()
    mockSetAlert = jest.fn()
    mockOnSuccess = jest.fn()
    mockOnError = jest.fn()
    mockSetIsDragActive = jest.fn()
  })

  describe('handleFileDrop', () => {
    it('should prevent default event behavior', async () => {
      await handleFileDrop(
        mockEvent,
        mockNavigate,
        '/prefix',
        true,
        mockSetAlert,
      )

      expect(mockEvent.preventDefault).toHaveBeenCalled()
    })

    it('should handle empty file list', async () => {
      mockEvent.dataTransfer.files = []

      await handleFileDrop(
        mockEvent,
        mockNavigate,
        '/prefix',
        true,
        mockSetAlert,
        mockOnSuccess,
        mockOnError,
      )

      expect(trackAlert).toHaveBeenCalledWith('File upload initiated but found no data')
      expect(mockSetAlert).toHaveBeenCalledWith('File upload initiated but found no data')
      expect(mockOnError).toHaveBeenCalledWith('File upload initiated but found no data')
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('should handle multiple files', async () => {
      mockEvent.dataTransfer.files = [{name: 'file1.ifc'}, {name: 'file2.ifc'}]

      await handleFileDrop(
        mockEvent,
        mockNavigate,
        '/prefix',
        true,
        mockSetAlert,
        mockOnSuccess,
        mockOnError,
      )

      expect(trackAlert).toHaveBeenCalledWith('File upload initiated for more than 1 file')
      expect(mockSetAlert).toHaveBeenCalledWith('File upload initiated for more than 1 file')
      expect(mockOnError).toHaveBeenCalledWith('File upload initiated for more than 1 file')
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('should handle unknown file type', async () => {
      const mockFile = {name: 'test.unknown', type: 'unknown', size: 1024}
      mockEvent.dataTransfer.files = [mockFile]
      guessTypeFromFile.mockResolvedValue(null)

      await handleFileDrop(
        mockEvent,
        mockNavigate,
        '/prefix',
        true,
        mockSetAlert,
        mockOnSuccess,
        mockOnError,
      )

      const expectedMessage = `File upload of unknown type: type(${mockFile.type}) size(${mockFile.size})`
      expect(trackAlert).toHaveBeenCalledWith(expectedMessage)
      expect(mockSetAlert).toHaveBeenCalledWith(expectedMessage)
      expect(mockOnError).toHaveBeenCalledWith(expectedMessage)
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('should handle successful file upload with OPFS available', async () => {
      const mockFile = {name: 'test.ifc', type: 'application/octet-stream', size: 1024}
      const mockType = 'ifc'
      const mockFileName = 'generated-filename.ifc'
      mockEvent.dataTransfer.files = [mockFile]
      guessTypeFromFile.mockResolvedValue(mockType)
      saveDnDFileToOpfs.mockImplementation((file, type, onWritten) => {
        onWritten(mockFileName)
      })

      await handleFileDrop(
        mockEvent,
        mockNavigate,
        '/prefix',
        true,
        mockSetAlert,
        mockOnSuccess,
        mockOnError,
      )

      expect(guessTypeFromFile).toHaveBeenCalledWith(mockFile)
      expect(saveDnDFileToOpfs).toHaveBeenCalledWith(mockFile, mockType, expect.any(Function))
      expect(disablePageReloadApprovalCheck).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/prefix/v/new/generated-filename.ifc')
      expect(mockOnSuccess).toHaveBeenCalledWith(mockFileName)
      expect(mockDebug.log).toHaveBeenCalledWith('handleFileDrop: uploadedFile', mockFile)
      expect(mockDebug.log).toHaveBeenCalledWith('handleFileDrop: navigate to:', mockFileName)
    })

    it('should handle successful file upload with OPFS fallback', async () => {
      const mockFile = {name: 'test.ifc', type: 'application/octet-stream', size: 1024}
      const mockType = 'ifc'
      const mockFileName = 'generated-filename.ifc'
      mockEvent.dataTransfer.files = [mockFile]
      guessTypeFromFile.mockResolvedValue(mockType)
      saveDnDFileToOpfsFallback.mockImplementation((file, onWritten) => {
        onWritten(mockFileName)
      })

      await handleFileDrop(
        mockEvent,
        mockNavigate,
        '/prefix',
        false, // OPFS not available
        mockSetAlert,
        mockOnSuccess,
        mockOnError,
      )

      expect(guessTypeFromFile).toHaveBeenCalledWith(mockFile)
      expect(saveDnDFileToOpfsFallback).toHaveBeenCalledWith(mockFile, expect.any(Function))
      expect(disablePageReloadApprovalCheck).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/prefix/v/new/generated-filename.ifc')
      expect(mockOnSuccess).toHaveBeenCalledWith(mockFileName)
    })

    it('should work without optional callbacks', async () => {
      const mockFile = {name: 'test.ifc', type: 'application/octet-stream', size: 1024}
      const mockType = 'ifc'
      const mockFileName = 'generated-filename.ifc'
      mockEvent.dataTransfer.files = [mockFile]
      guessTypeFromFile.mockResolvedValue(mockType)
      saveDnDFileToOpfs.mockImplementation((file, type, onWritten) => {
        onWritten(mockFileName)
      })

      await handleFileDrop(
        mockEvent,
        mockNavigate,
        '/prefix',
        true,
        mockSetAlert,
      )

      expect(mockNavigate).toHaveBeenCalledWith('/prefix/v/new/generated-filename.ifc')
      // Should not throw errors when optional callbacks are not provided
    })

    it('should handle error without onError callback', async () => {
      mockEvent.dataTransfer.files = []

      await handleFileDrop(
        mockEvent,
        mockNavigate,
        '/prefix',
        true,
        mockSetAlert,
      )

      expect(trackAlert).toHaveBeenCalledWith('File upload initiated but found no data')
      expect(mockSetAlert).toHaveBeenCalledWith('File upload initiated but found no data')
      // Should not throw errors when onError callback is not provided
    })
  })

  describe('handleDragOverOrEnter', () => {
    it('should prevent default event behavior', () => {
      handleDragOverOrEnter(mockEvent, mockSetIsDragActive)

      expect(mockEvent.preventDefault).toHaveBeenCalled()
    })

    it('should set drag active state when callback provided', () => {
      handleDragOverOrEnter(mockEvent, mockSetIsDragActive)

      expect(mockSetIsDragActive).toHaveBeenCalledWith(true)
    })

    it('should work without setIsDragActive callback', () => {
      expect(() => {
        handleDragOverOrEnter(mockEvent)
      }).not.toThrow()

      expect(mockEvent.preventDefault).toHaveBeenCalled()
    })
  })

  describe('handleDragLeave', () => {
    it('should prevent default event behavior', () => {
      handleDragLeave(mockEvent, mockSetIsDragActive)

      expect(mockEvent.preventDefault).toHaveBeenCalled()
    })

    it('should set drag inactive state when callback provided', () => {
      handleDragLeave(mockEvent, mockSetIsDragActive)

      expect(mockSetIsDragActive).toHaveBeenCalledWith(false)
    })

    it('should work without setIsDragActive callback', () => {
      expect(() => {
        handleDragLeave(mockEvent)
      }).not.toThrow()

      expect(mockEvent.preventDefault).toHaveBeenCalled()
    })
  })
})
