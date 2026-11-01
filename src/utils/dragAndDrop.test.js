import {handleFileDrop, handleDragOverOrEnter, handleDragLeave} from './dragAndDrop'
import {guessTypeFromFile} from '../Filetype'
import {checkOPFSAvailability, deleteUploadFromOPFS, saveDnDFileToOpfs} from '../OPFS/utils'
import {addRecentFileEntry, setPendingModelNameUpdate} from '../connections/persistence'
import {getInMemoryUpload} from '../loader/inMemoryUploads'
import {inflateIfGzipEnvelope} from '../loader/gzipEnvelope'
import {disablePageReloadApprovalCheck} from './event'
import {trackAlert} from './alertTracking'
import debug, {WARN} from './debug'


// Mock all dependencies
jest.mock('../Filetype')
jest.mock('../OPFS/utils')
jest.mock('../connections/persistence')
jest.mock('../loader/gzipEnvelope')
jest.mock('./event')
jest.mock('./alertTracking')
jest.mock('./debug')

const mockDebug = {
  log: jest.fn(),
  warn: jest.fn(),
}
debug.mockReturnValue(mockDebug)

const UUID_DOT_IFC = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.ifc$/


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

    // The envelope strip is a pass-through for every file that is not a gzip
    // member, which is all of them here bar the one test that says otherwise.
    // Automocked it would return undefined and every drop would lose its file.
    inflateIfGzipEnvelope.mockImplementation((file) => Promise.resolve(file))

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
      // An alert object AlertDialog reports as one info issue, carrying the
      // extension but never the file name (loader/unrecognizedFormat.js).
      expect(mockSetAlert).toHaveBeenCalledWith(
        {type: 'unrecognizedFormat', message: expectedMessage, ext: 'unknown', entry: 'drop'})
      expect(mockOnError).toHaveBeenCalledWith(expectedMessage)
      expect(mockNavigate).not.toHaveBeenCalled()
      // And the console hears about it, at a level prod prints — naming the
      // file, which the alert leaves out (test-models#69 had neither).
      expect(debug).toHaveBeenCalledWith(WARN)
      expect(mockDebug.warn).toHaveBeenCalledTimes(1)
      expect(mockDebug.warn).toHaveBeenCalledWith(expect.stringContaining('"test.unknown" (1024 bytes)'))
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
      expect(mockNavigate).toHaveBeenCalledWith('/prefix/v/local-only/generated-filename.ifc')
      expect(mockOnSuccess).toHaveBeenCalledWith(mockFileName)
      expect(mockDebug.log).toHaveBeenCalledWith('handleFileDrop: uploadedFile', mockFile)
      expect(mockDebug.log).toHaveBeenCalledWith('handleFileDrop: navigate to:', mockFileName)
    })

    // Without OPFS the file is held in this page's memory and opened by an
    // in-app navigation: a page load would drop it before the Loader could
    // read it, and nothing is stored to list as a recent (#1906).
    it('holds the file in memory and navigates in-app when OPFS is unavailable', async () => {
      const mockFile = {name: 'test.ifc', type: 'application/octet-stream', size: 1024}
      mockEvent.dataTransfer.files = [mockFile]
      guessTypeFromFile.mockResolvedValue('ifc')

      await handleFileDrop(
        mockEvent,
        mockNavigate,
        '/prefix',
        false, // OPFS not available
        mockSetAlert,
        mockOnSuccess,
        mockOnError,
      )

      expect(mockOnSuccess).toHaveBeenCalledTimes(1)
      const storageId = mockOnSuccess.mock.calls[0][0]
      expect(storageId).toMatch(UUID_DOT_IFC)
      expect(getInMemoryUpload(storageId)).toBe(mockFile)
      expect(mockNavigate).toHaveBeenCalledWith(`/prefix/v/local-only/${storageId}`)
      expect(saveDnDFileToOpfs).not.toHaveBeenCalled()
      expect(addRecentFileEntry).not.toHaveBeenCalled()
      expect(setPendingModelNameUpdate).not.toHaveBeenCalled()
      expect(mockSetAlert).not.toHaveBeenCalled()
      expect(mockOnError).not.toHaveBeenCalled()
    })

    it('gates an in-memory drop on the quota like any other', async () => {
      mockEvent.dataTransfer.files = [{name: 'test.ifc', type: 'application/octet-stream', size: 1024}]
      guessTypeFromFile.mockResolvedValue('ifc')
      const quotaOptions = {
        record: jest.fn().mockResolvedValue({allowed: false}),
        onExceeded: jest.fn(),
      }

      await handleFileDrop(
        mockEvent, mockNavigate, '/prefix', false, mockSetAlert, mockOnSuccess, mockOnError, quotaOptions)

      expect(quotaOptions.record).toHaveBeenCalledWith(expect.stringMatching(/^\/prefix\/v\/local-only\//))
      expect(quotaOptions.onExceeded).toHaveBeenCalled()
      // A denied file must not stay held for the life of the page.
      const deniedId = quotaOptions.record.mock.calls[0][0].split('/').pop()
      expect(getInMemoryUpload(deniedId)).toBeUndefined()
      expect(mockNavigate).not.toHaveBeenCalled()
      expect(mockOnSuccess).not.toHaveBeenCalled()
    })

    // bldrs-ai/ops#39: with `meterLocalFiles` on, an OPFS drop is written
    // before record() answers. Left there on a refusal, its storage id still
    // opened from the /v/local-only/ URL, past the refusal.
    describe('with the drop written to OPFS before the quota answers', () => {
      const STORAGE_ID = 'blob-uuid.ifc'
      let written

      beforeEach(() => {
        mockEvent.dataTransfer.files = [{name: 'test.ifc', type: 'application/octet-stream', size: 1024}]
        guessTypeFromFile.mockResolvedValue('ifc')
        deleteUploadFromOPFS.mockResolvedValue(true)
        // onWritten is async and handleFileDrop doesn't await the write, so
        // keep its promise to settle the record() answer on.
        saveDnDFileToOpfs.mockImplementation((file, type, onWritten) => {
          written = onWritten(STORAGE_ID)
        })
      })

      it('deletes a refused drop from OPFS', async () => {
        const quotaOptions = {record: jest.fn().mockResolvedValue({allowed: false}), onExceeded: jest.fn()}

        await handleFileDrop(
          mockEvent, mockNavigate, '/prefix', true, mockSetAlert, mockOnSuccess, mockOnError, quotaOptions)
        await written

        expect(quotaOptions.record).toHaveBeenCalledWith(`/prefix/v/local-only/${STORAGE_ID}`)
        expect(deleteUploadFromOPFS.mock.calls).toEqual([[STORAGE_ID]])
        expect(quotaOptions.onExceeded).toHaveBeenCalledTimes(1)
        expect(mockNavigate).not.toHaveBeenCalled()
        expect(addRecentFileEntry).not.toHaveBeenCalled()
      })

      it('still raises the limit dialog when the delete fails', async () => {
        deleteUploadFromOPFS.mockRejectedValue(new Error('SecurityError'))
        const quotaOptions = {record: jest.fn().mockResolvedValue({allowed: false}), onExceeded: jest.fn()}

        await handleFileDrop(
          mockEvent, mockNavigate, '/prefix', true, mockSetAlert, mockOnSuccess, mockOnError, quotaOptions)
        await written
        // Let the rejected delete's catch run.
        await Promise.resolve()

        expect(quotaOptions.onExceeded).toHaveBeenCalledTimes(1)
        expect(mockDebug.warn).toHaveBeenCalledWith(
          'handleFileDrop: could not delete the refused upload', STORAGE_ID, expect.any(Error))
      })

      it('keeps an allowed drop in OPFS', async () => {
        const quotaOptions = {record: jest.fn().mockResolvedValue({allowed: true}), onExceeded: jest.fn()}

        await handleFileDrop(
          mockEvent, mockNavigate, '/prefix', true, mockSetAlert, mockOnSuccess, mockOnError, quotaOptions)
        await written

        expect(deleteUploadFromOPFS).not.toHaveBeenCalled()
        expect(mockNavigate).toHaveBeenCalledWith(`/prefix/v/local-only/${STORAGE_ID}`)
      })
    })

    // Share#1966: a local file is free and unmetered, so a user at their
    // private-model limit still opens one. Before, a `hasCapacity` pre-gate
    // refused the drop before its key was known; now record() — which passes
    // a /v/local-only/ key — is the only gate. `hasCapacity: false` is the
    // old caller shape, kept here to show it no longer refuses anything.
    it('opens a local drop for a user at their private-model limit', async () => {
      mockEvent.dataTransfer.files = [{name: 'test.ifc', type: 'application/octet-stream', size: 1024}]
      guessTypeFromFile.mockResolvedValue('ifc')
      const quotaOptions = {
        hasCapacity: false,
        record: jest.fn().mockResolvedValue({allowed: true}),
        onExceeded: jest.fn(),
      }

      await handleFileDrop(
        mockEvent, mockNavigate, '/prefix', false, mockSetAlert, mockOnSuccess, mockOnError, quotaOptions)

      expect(quotaOptions.onExceeded).not.toHaveBeenCalled()
      expect(quotaOptions.record).toHaveBeenCalledWith(expect.stringMatching(/^\/prefix\/v\/local-only\//))
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/prefix\/v\/local-only\/.+\.ifc$/))
    })

    // `null` is the store before BaseRoutes' probe resolves: "not known yet",
    // which must not read as "unavailable".
    it('asks for OPFS itself when the store has not resolved it yet', async () => {
      mockEvent.dataTransfer.files = [{name: 'test.ifc', type: 'application/octet-stream', size: 1024}]
      guessTypeFromFile.mockResolvedValue('ifc')
      checkOPFSAvailability.mockResolvedValue(true)

      await handleFileDrop(mockEvent, mockNavigate, '/prefix', null, mockSetAlert)

      expect(checkOPFSAvailability).toHaveBeenCalled()
      expect(saveDnDFileToOpfs).toHaveBeenCalled()
      expect(mockSetAlert).not.toHaveBeenCalled()
    })

    it('holds the file in memory when the store has not resolved OPFS and the probe says no', async () => {
      mockEvent.dataTransfer.files = [{name: 'test.ifc', type: 'application/octet-stream', size: 1024}]
      guessTypeFromFile.mockResolvedValue('ifc')
      checkOPFSAvailability.mockResolvedValue(false)

      await handleFileDrop(mockEvent, mockNavigate, '/prefix', null, mockSetAlert)

      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/prefix\/v\/local-only\/.+\.ifc$/))
      expect(saveDnDFileToOpfs).not.toHaveBeenCalled()
      expect(mockSetAlert).not.toHaveBeenCalled()
    })

    it('records the file in recent history after successful drop', async () => {
      const lastModified = new Date('2023-11-14T22:13:20.000Z').getTime()
      const mockFile = {name: 'mymodel.ifc', type: 'application/octet-stream', size: 1024, lastModified}
      const mockFileName = 'generated-uuid.ifc'
      mockEvent.dataTransfer.files = [mockFile]
      guessTypeFromFile.mockResolvedValue('ifc')
      saveDnDFileToOpfs.mockImplementation((file, type, onWritten) => {
        onWritten(mockFileName)
      })

      await handleFileDrop(mockEvent, mockNavigate, '/prefix', true, mockSetAlert)

      expect(addRecentFileEntry).toHaveBeenCalledWith({
        id: mockFileName,
        source: 'local',
        name: 'mymodel.ifc',
        // Epoch ms, not an ISO string — RecentFilesList does
        // `Date.now() - utcMs` and would render "NaNm ago" (#1682).
        lastModifiedUtc: lastModified,
        sharePath: `/prefix/v/local-only/${mockFileName}`,
      })
      expect(setPendingModelNameUpdate).toHaveBeenCalledWith(mockFileName)
    })

    // The recents row must navigate by the OPFS storage id the worker
    // wrote under, never by the user's filename — see #1682.
    it('records the storage id as the entry id and the user filename as display name', async () => {
      const mockFile = {name: 'mymodel.ifc', type: 'application/octet-stream', size: 1024}
      mockEvent.dataTransfer.files = [mockFile]
      guessTypeFromFile.mockResolvedValue('ifc')
      saveDnDFileToOpfs.mockImplementation((file, type, onWritten) => {
        onWritten('ADD77535-D1B6-49A9-915B-41343B08BF83.ifc')
      })

      await handleFileDrop(mockEvent, mockNavigate, '/prefix', true, mockSetAlert)

      expect(addRecentFileEntry).toHaveBeenCalledWith(expect.objectContaining({
        id: 'ADD77535-D1B6-49A9-915B-41343B08BF83.ifc',
        name: 'mymodel.ifc',
        sharePath: '/prefix/v/local-only/ADD77535-D1B6-49A9-915B-41343B08BF83.ifc',
      }))
    })

    it('records recent entry with null lastModifiedUtc when lastModified is absent', async () => {
      const mockFile = {name: 'model.ifc', type: 'application/octet-stream', size: 512}
      mockEvent.dataTransfer.files = [mockFile]
      guessTypeFromFile.mockResolvedValue('ifc')
      saveDnDFileToOpfs.mockImplementation((file, type, onWritten) => {
        onWritten('stored.ifc')
      })

      await handleFileDrop(mockEvent, mockNavigate, '/prefix', true, mockSetAlert)

      expect(addRecentFileEntry).toHaveBeenCalledWith(
        expect.objectContaining({lastModifiedUtc: null}),
      )
    })

    it('does not record recent entry when file type is unknown', async () => {
      mockEvent.dataTransfer.files = [{name: 'file.xyz', type: '', size: 100}]
      guessTypeFromFile.mockResolvedValue(null)

      await handleFileDrop(mockEvent, mockNavigate, '/prefix', true, mockSetAlert)

      expect(addRecentFileEntry).not.toHaveBeenCalled()
      expect(setPendingModelNameUpdate).not.toHaveBeenCalled()
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

      expect(mockNavigate).toHaveBeenCalledWith('/prefix/v/local-only/generated-filename.ifc')
      // Should not throw errors when optional callbacks are not provided
    })

    it('stores the INFLATED bytes of a dropped .glb.gz, under the model\'s own type', async () => {
      // The round trip this closes (#1831): Share exports `index.glb.gz`
      // and a user drops it back. What reaches OPFS has to be the GLB — the
      // envelope is gone by then, so the storage extension, the `/v/local-only/`
      // route and the loader all describe the model rather than its transport
      // encoding.
      const droppedFile = {name: 'index.glb.gz', type: 'application/gzip', size: 512}
      const inflatedFile = {name: 'index.glb.gz', type: '', size: 2048}
      mockEvent.dataTransfer.files = [droppedFile]
      inflateIfGzipEnvelope.mockResolvedValue(inflatedFile)
      guessTypeFromFile.mockResolvedValue('glb')
      saveDnDFileToOpfs.mockImplementation((file, type, onWritten) => onWritten('generated.glb'))

      await handleFileDrop(mockEvent, mockNavigate, '/prefix', true, mockSetAlert, mockOnSuccess, mockOnError)

      expect(inflateIfGzipEnvelope).toHaveBeenCalledWith(droppedFile)
      // Sniffed AFTER the inflate, or the type would be whatever gzip is.
      expect(guessTypeFromFile).toHaveBeenCalledWith(inflatedFile)
      expect(saveDnDFileToOpfs).toHaveBeenCalledWith(inflatedFile, 'glb', expect.any(Function))
      expect(mockNavigate).toHaveBeenCalledWith('/prefix/v/local-only/generated.glb')
      expect(mockOnError).not.toHaveBeenCalled()
    })

    it('alerts, rather than throwing, when a compressed drop cannot be opened', async () => {
      // A browser with no `DecompressionStream` (Safari before 16.4), or a
      // file that is not what it claims. The drop handler is the only thing
      // watching, so the sentence it was given is the one the user gets.
      const message = 'Cannot open a compressed (.gz) model in this browser.'
      mockEvent.dataTransfer.files = [{name: 'index.glb.gz', type: 'application/gzip', size: 512}]
      inflateIfGzipEnvelope.mockRejectedValue(new Error(message))

      await handleFileDrop(mockEvent, mockNavigate, '/prefix', true, mockSetAlert, mockOnSuccess, mockOnError)

      expect(mockSetAlert).toHaveBeenCalledWith(message)
      expect(mockOnError).toHaveBeenCalledWith(message)
      expect(saveDnDFileToOpfs).not.toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    // Every rejected drop used to reach Sentry twice in the same second:
    // once from here and once from AlertDialog's effect, which captures what
    // setAlert hands it. AlertDialog is the single capture point now.
    it('leaves Sentry capture to AlertDialog for every rejected drop', async () => {
      const unknown = {name: 'plan.dwg', type: '', size: 305}
      guessTypeFromFile.mockResolvedValue(null)
      for (const files of [[], [{name: 'a.ifc'}, {name: 'b.ifc'}], [unknown]]) {
        mockEvent.dataTransfer.files = files
        await handleFileDrop(mockEvent, mockNavigate, '/prefix', true, mockSetAlert, mockOnSuccess, mockOnError)
      }
      inflateIfGzipEnvelope.mockRejectedValue(new Error('Cannot open a compressed (.gz) model in this browser.'))
      mockEvent.dataTransfer.files = [{name: 'index.glb.gz', type: 'application/gzip', size: 512}]
      await handleFileDrop(mockEvent, mockNavigate, '/prefix', true, mockSetAlert, mockOnSuccess, mockOnError)

      expect(mockSetAlert).toHaveBeenCalledTimes(4)
      expect(trackAlert).not.toHaveBeenCalled()
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
