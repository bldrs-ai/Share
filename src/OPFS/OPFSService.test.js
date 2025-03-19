// Mock the debug module so we can spy on its error method.
const mockDebugInstance = {error: jest.fn()}
jest.mock('../utils/debug', () => () => mockDebugInstance)


// Mock the OctokitExport file with the required URL constants.
jest.mock('../net/github/OctokitExport', () => ({
  GITHUB_BASE_URL_AUTHED: 'https://auth.bldrs.ai',
  GITHUB_BASE_URL_UNAUTHED: 'https://unauth.bldrs.ai',
}))


/**
 * A fake Worker implementation for testing purposes.
 *
 * This class simulates a Web Worker by recording calls to postMessage,
 * supporting termination, and allowing onmessage callbacks to be set.
 */
class FakeWorker {
  /**
   * Creates an instance of FakeWorker.
   *
   * @param {string} script - The URL or identifier of the worker script.
   */
  constructor(script) {
    this.script = script
    this.postMessage = jest.fn()
    this.terminate = jest.fn()
    this.onmessage = null
  }
}
global.Worker = FakeWorker

describe('OPFSService module', () => {
  let opfsService
  // eslint-disable-next-line no-unused-vars
  let debug

  // Reset modules before each test so that the module-level workerRef resets.
  beforeEach(() => {
    jest.resetModules()
    opfsService = require('./OPFSService')
    // Get the debug instance so we can check error messages.
    debug = require('../utils/debug')()
  })

  afterEach(() => {
    // Ensure worker is terminated between tests.
    opfsService.terminateWorker()
  })

  test('initializeWorker creates a new worker when none exists', () => {
    const worker = opfsService.initializeWorker()
    expect(worker).toBeInstanceOf(FakeWorker)
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'initializeWorker',
      GITHUB_BASE_URL_AUTHED: 'https://auth.bldrs.ai',
      GITHUB_BASE_URL_UNAUTHED: 'https://unauth.bldrs.ai',
    })
  })

  test('initializeWorker returns the same worker if already initialized', () => {
    const worker1 = opfsService.initializeWorker()
    const worker2 = opfsService.initializeWorker()
    expect(worker2).toBe(worker1)
  })

  test('terminateWorker terminates the worker and resets its reference', () => {
    const worker = opfsService.initializeWorker()
    opfsService.terminateWorker()
    expect(worker.terminate).toHaveBeenCalled()
    // After termination, initializing again should create a new worker.
    const newWorker = opfsService.initializeWorker()
    expect(newWorker).not.toBe(worker)
  })

  test('opfsWriteFile posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    opfsService.opfsWriteFile('https://bldrs.ai/file', 'test.txt')
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'writeObjectURLToFile',
      objectUrl: 'https://bldrs.ai/file',
      fileName: 'test.txt',
    })
  })

  test('opfsWriteFile logs an error if the worker is not initialized', () => {
    opfsService.terminateWorker()
    opfsService.opfsWriteFile('https://bldrs.ai/file', 'test.txt')
    expect(mockDebugInstance.error).toHaveBeenCalledWith('Worker not initialized')
  })

  test('opfsWriteModel posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    opfsService.opfsWriteModel('https://bldrs.ai/model', 'model.txt', 'commit123')
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'writeObjectModel',
      objectUrl: 'https://bldrs.ai/model',
      objectKey: 'commit123',
      originalFileName: 'model.txt',
    })
  })

  test('opfsDeleteModel posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    opfsService.opfsDeleteModel('file.txt', 'commit456', 'ownerName', 'repoName', 'main')
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'deleteModel',
      commitHash: 'commit456',
      originalFilePath: 'file.txt',
      owner: 'ownerName',
      repo: 'repoName',
      branch: 'main',
    })
  })

  test('opfsDoesFileExist posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    opfsService.opfsDoesFileExist('file.txt', 'commit789', 'ownerName', 'repoName', 'main')
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'doesFileExist',
      commitHash: 'commit789',
      originalFilePath: 'file.txt',
      owner: 'ownerName',
      repo: 'repoName',
      branch: 'main',
    })
  })

  test('onWorkerMessage sets the onmessage callback if the worker exists', () => {
    const worker = opfsService.initializeWorker()
    const callback = jest.fn()
    opfsService.onWorkerMessage(callback)
    expect(worker.onmessage).toBe(callback)
  })

  test('onWorkerMessage does nothing if no worker exists', () => {
    opfsService.terminateWorker()
    expect(() => {
      opfsService.onWorkerMessage(jest.fn())
    }).not.toThrow()
  })

  test('opfsWriteModelFileHandle posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    const dummyFile = new File(['dummy content'], 'dummy.txt', {type: 'text/plain'})
    opfsService.opfsWriteModelFileHandle(dummyFile, 'dummyPath', 'commit999', 'ownerX', 'repoY', 'main')
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'writeObjectModelFileHandle',
      file: dummyFile,
      objectKey: 'commit999',
      originalFilePath: 'dummyPath',
      owner: 'ownerX',
      repo: 'repoY',
      branch: 'main',
    })
  })

  test('opfsDownloadToOPFS posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    const dummyProgress = jest.fn()
    opfsService.opfsDownloadToOPFS('https://bldrs.ai/file', 'commitAAA', 'filePath.txt', 'ownerX', 'repoY', 'main', dummyProgress)
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'downloadToOPFS',
      objectUrl: 'https://bldrs.ai/file',
      commitHash: 'commitAAA',
      originalFilePath: 'filePath.txt',
      owner: 'ownerX',
      repo: 'repoY',
      branch: 'main',
      onProgress: dummyProgress,
    })
  })

  test('opfsDownloadModel posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    const dummyProgress = jest.fn()
    opfsService.opfsDownloadModel('https://bldrs.ai/model', 'sha123', 'modelPath.txt', 'ownerX', 'repoY', 'main', 'token123', dummyProgress)
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'downloadModel',
      objectUrl: 'https://bldrs.ai/model',
      shaHash: 'sha123',
      originalFilePath: 'modelPath.txt',
      owner: 'ownerX',
      repo: 'repoY',
      branch: 'main',
      accessToken: 'token123',
      onProgress: dummyProgress,
    })
  })

  test('opfsWriteBase64Model posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    opfsService.opfsWriteBase64Model('base64Content', 'shaBase64', 'modelPath.txt', 'ownerX', 'repoY', 'main', 'token123')
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'writeBase64Model',
      content: 'base64Content',
      shaHash: 'shaBase64',
      originalFilePath: 'modelPath.txt',
      owner: 'ownerX',
      repo: 'repoY',
      branch: 'main',
      accessToken: 'token123',
    })
  })

  test('opfsReadFile posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    opfsService.opfsReadFile('readTest.txt')
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'readObjectFromStorage',
      fileName: 'readTest.txt',
    })
  })

  test('opfsReadModel posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    opfsService.opfsReadModel('modelKey123')
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'readModelFromStorage',
      modelKey: 'modelKey123',
    })
  })

  test('opfsClearCache posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    opfsService.opfsClearCache()
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'clearCache',
    })
  })

  test('opfsSnapshotCache posts the correct message when the worker is initialized', () => {
    const worker = opfsService.initializeWorker()
    opfsService.opfsSnapshotCache()
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'snapshotCache',
    })
  })
})
