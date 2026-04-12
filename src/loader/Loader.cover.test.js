/* eslint-disable no-magic-numbers, require-await */
// Gap-filling tests for Loader.js. These complement Loader.test.js (which
// does end-to-end load tests against real fixture files) by targeting the
// unit-level error paths and small helpers that the main tests don't
// reach. Axios and the OPFS utilities are mocked so we can force specific
// error shapes.

import axios from 'axios'
import {downloadToOPFS, downloadModel, getModelFromOPFS} from '../OPFS/utils'
import {constructUploadedBlobPath, load, NotFoundError} from './Loader'
import {dereferenceAndProxyDownloadContents} from './urls'


jest.mock('axios')

// Mock OPFS utils so we can steer the isOpfsAvailable=true path without
// needing a real worker or cache.
jest.mock('../OPFS/utils', () => ({
  getModelFromOPFS: jest.fn(),
  downloadToOPFS: jest.fn(),
  downloadModel: jest.fn(),
  doesFileExistInOPFS: jest.fn(),
  writeBase64Model: jest.fn(),
}))

// Mock urls.js so we can force specific dereference results (and avoid
// parseUrl's real MSW expectations).
jest.mock('./urls', () => ({
  dereferenceAndProxyDownloadContents: jest.fn(),
}))


/**
 * Build a minimal viewer stub that satisfies the non-IFC path through
 * load(): `viewer.IFC.addIfcModel`, `viewer.IFC.loader.ifcManager.state.models`,
 * and a `.type` slot for the loader to tag.
 *
 * @return {object}
 */
function makeViewerStub() {
  return {
    IFC: {
      type: null,
      addIfcModel: jest.fn(),
      loader: {
        ifcManager: {state: {models: []}},
      },
    },
  }
}


/** MockBlob with an arrayBuffer() that yields the given bytes. */
class MockFile {
  /** @param {ArrayBuffer|Uint8Array|string} content */
  constructor(content) {
    this.content = content
  }

  /** @return {Promise<ArrayBuffer>} */
  async arrayBuffer() {
    if (typeof this.content === 'string') {
      return new TextEncoder().encode(this.content).buffer
    }
    if (this.content instanceof Uint8Array) {
      return this.content.buffer.slice(
        this.content.byteOffset,
        this.content.byteOffset + this.content.byteLength,
      )
    }
    return this.content
  }
}


describe('Loader exported helpers', () => {
  describe('NotFoundError', () => {
    it('is an Error subclass with name "NotFoundError"', () => {
      const err = new NotFoundError('missing')
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(NotFoundError)
      expect(err.name).toBe('NotFoundError')
      expect(err.message).toBe('missing')
    })

    it('has a stack trace', () => {
      expect(typeof new NotFoundError('x').stack).toBe('string')
    })
  })


  describe('constructUploadedBlobPath', () => {
    // jsdom window.location defaults to http://localhost/
    it('produces a blob URL using the current window.location origin and the final path segment', () => {
      const blobPath = constructUploadedBlobPath('abcd-1234')
      expect(blobPath.startsWith('blob:http://localhost')).toBe(true)
      expect(blobPath.endsWith('/abcd-1234')).toBe(true)
    })

    it('uses only the final path segment when given a nested path', () => {
      const blobPath = constructUploadedBlobPath('folder/sub/file-uuid')
      expect(blobPath.endsWith('/file-uuid')).toBe(true)
      expect(blobPath.includes('folder/sub')).toBe(false)
    })
  })
})


describe('load() with isOpfsAvailable=false (axios path)', () => {
  let viewer
  let onProgress
  let setOpfsFile

  beforeEach(() => {
    axios.get.mockReset()
    dereferenceAndProxyDownloadContents.mockReset()
    downloadToOPFS.mockReset()
    downloadModel.mockReset()

    viewer = makeViewerStub()
    onProgress = jest.fn()
    setOpfsFile = jest.fn()
  })


  it('downloads via axios when OPFS is not available', async () => {
    // Path is http-hosted → goes through dereferenceAndProxyDownloadContents.
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/cube.stl',
      '',
      false,
      false,
    ])
    // STL is binary, so axios returns an ArrayBuffer.
    const stlContent = new Uint8Array([0, 1, 2, 3]).buffer
    axios.get.mockResolvedValue({data: stlContent})

    // Trigger the axios path. The test will throw inside readModel (since
    // four bytes aren't a real STL), so we just assert that axios was
    // called with the dereferenced URL and responseType:'arraybuffer'.
    await expect(
      load('https://example.com/cube.stl', viewer, onProgress, false, setOpfsFile, ''),
    ).rejects.toThrow()

    expect(axios.get).toHaveBeenCalledTimes(1)
    const [url, options] = axios.get.mock.calls[0]
    expect(url).toBe('https://example.com/cube.stl')
    expect(options.responseType).toBe('arraybuffer')
  })


  it('requests text when the format is text-based', async () => {
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/model.obj',
      '',
      false,
      false,
    ])
    axios.get.mockResolvedValue({data: 'v 0 0 0\nv 1 0 0\nv 0 1 0\n'})

    // OBJ is text; we only care that axios was called with
    // responseType:'text'. The load itself may succeed or fail depending
    // on downstream parsing — either way is acceptable for this branch.
    try {
      await load('https://example.com/model.obj', viewer, onProgress, false, setOpfsFile, '')
    } catch (_) {
      // ignore
    }

    expect(axios.get.mock.calls[0][1].responseType).toBe('text')
  })


  it('converts a 404 from axios into NotFoundError', async () => {
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/missing.obj',
      '',
      false,
      false,
    ])
    axios.get.mockRejectedValue({
      response: {status: 404, data: 'not found'},
    })

    await expect(
      load('https://example.com/missing.obj', viewer, onProgress, false, setOpfsFile, ''),
    ).rejects.toBeInstanceOf(NotFoundError)
  })


  it('wraps non-404 axios server errors with the status in the message', async () => {
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/boom.obj',
      '',
      false,
      false,
    ])
    axios.get.mockRejectedValue({
      response: {status: 500, data: 'oops'},
    })

    await expect(
      load('https://example.com/boom.obj', viewer, onProgress, false, setOpfsFile, ''),
    ).rejects.toThrow(/status\(500\)/)
  })


  it('throws a "no response" error when axios reports a request without a response', async () => {
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/dead.obj',
      '',
      false,
      false,
    ])
    axios.get.mockRejectedValue({request: {}}) // no response field

    await expect(
      load('https://example.com/dead.obj', viewer, onProgress, false, setOpfsFile, ''),
    ).rejects.toThrow(/No response received/)
  })


  it('throws a generic "failed to fetch" error on an unspecific axios failure', async () => {
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/weird.obj',
      '',
      false,
      false,
    ])
    axios.get.mockRejectedValue(new Error('cold'))

    await expect(
      load('https://example.com/weird.obj', viewer, onProgress, false, setOpfsFile, ''),
    ).rejects.toThrow(/Failed to fetch/)
  })


  it('reports download progress through onProgress when axios fires onDownloadProgress', async () => {
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/cube.stl',
      '',
      false,
      false,
    ])
    axios.get.mockImplementation(async (_url, options) => {
      // Simulate axios reporting progress mid-download.
      options.onDownloadProgress({loaded: 1024 * 1024 * 2.5})
      return {data: new ArrayBuffer(8)}
    })

    await expect(
      load('https://example.com/cube.stl', viewer, onProgress, false, setOpfsFile, ''),
    ).rejects.toThrow() // readModel will still fail on junk bytes

    // "2.50 MB" is the megabyte-formatted progress message.
    expect(onProgress).toHaveBeenCalledWith('2.50 MB')
  })
})


describe('load() error/edge paths with OPFS enabled', () => {
  let viewer
  let onProgress
  let setOpfsFile

  beforeEach(() => {
    axios.get.mockReset()
    dereferenceAndProxyDownloadContents.mockReset()
    downloadToOPFS.mockReset()
    downloadModel.mockReset()

    viewer = makeViewerStub()
    onProgress = jest.fn()
    setOpfsFile = jest.fn()
  })


  it('throws a descriptive error on an unparseable URL', async () => {
    // Path has a valid extension so findLoader passes, but the string
    // is not a legal URL — `new URL(path)` inside the OPFS branch throws
    // and the error is re-wrapped as "Invalid URL path".
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'http:// bad.ifc',
      '',
      false,
      false,
    ])

    await expect(
      load('http:// bad.ifc', viewer, onProgress, true, setOpfsFile, ''),
    ).rejects.toThrow(/Invalid URL path/)
  })


  it('routes non-github hosts through downloadToOPFS with the url host', async () => {
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/cube.stl',
      '',
      false,
      false,
    ])
    downloadToOPFS.mockResolvedValue(new MockFile(new Uint8Array(4)))

    // Will still fail inside readModel — we just want to hit the branch
    // and assert the downloadToOPFS args.
    await expect(
      load('https://example.com/cube.stl', viewer, onProgress, true, setOpfsFile, ''),
    ).rejects.toThrow()

    expect(downloadToOPFS).toHaveBeenCalledTimes(1)
    const args = downloadToOPFS.mock.calls[0]
    expect(args[0]).toBe('https://example.com/cube.stl') // path
    expect(args[2]).toBe('example.com') // pathUrl.host
  })


  it('skips dereferenceAndProxyDownloadContents for locally hosted files when OPFS is disabled', async () => {
    // A path with a leading slash and no http: prefix is "locally hosted"
    // (e.g. served by the dev static server). Loader.js skips the
    // dereference step and feeds the path straight to axios.
    axios.get.mockRejectedValue(new Error('no fixture needed'))

    await expect(
      load('/index.obj', viewer, onProgress, false, setOpfsFile, ''),
    ).rejects.toThrow()

    expect(dereferenceAndProxyDownloadContents).not.toHaveBeenCalled()
    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.get.mock.calls[0][0]).toBe('/index.obj')
  })


  it('reads an uploaded file out of OPFS via getModelFromOPFS', async () => {
    // A valid RFC-4122-ish UUID (3rd group starts with [1-5], 4th with
    // [89abAB]) triggers the "uploaded file" branch in load():
    //   - isUploadedFile = true
    //   - constructUploadedBlobPath rewrites the path to a blob: URL
    //   - in the OPFS arm, getModelFromOPFS is called instead of
    //     downloadModel / downloadToOPFS.
    getModelFromOPFS.mockReset()
    getModelFromOPFS.mockResolvedValue(new MockFile(new Uint8Array(4)))

    // After constructUploadedBlobPath, path starts with "blob:" which is
    // neither "http" nor a locally-hosted path — load() falls through
    // to the dereference call before the OPFS branch. Feed it a value.
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'blob:http://localhost/uuid.stl',
      '',
      false,
      false,
    ])

    const uuidPath = '12345678-1234-4abc-9def-123456789abc.stl'

    await expect(
      load(uuidPath, viewer, onProgress, true, setOpfsFile, ''),
    ).rejects.toThrow() // readModel still fails on junk bytes

    expect(getModelFromOPFS).toHaveBeenCalledTimes(1)
  })


  // TODO: Loader.js tags errors with `isOutOfMemory` by calling
  // `isOutOfMemoryError(err)` from src/utils/oom.js, which is message-
  // sniffing based. The refactor should confirm the OOM shapes it looks
  // for still match the engines (Conway, web-ifc) we're actually using.
  it('tags out-of-memory errors from the IFC loader with isOutOfMemory', async () => {
    // Build a viewer with an IFC loader whose inner parse throws an OOM.
    // newIfcLoader's hot-patched parse catches, tags, and rethrows. The
    // error message must match one of the heuristics in src/utils/oom.js.
    const oomErr = new RangeError('WebAssembly: out of memory')
    const ifcViewer = {
      IFC: {
        type: null,
        ifcLastError: null,
        addIfcModel: jest.fn(),
        loader: {
          parse: jest.fn().mockRejectedValue(oomErr),
          ifcManager: {
            state: {models: []},
            applyWebIfcConfig: jest.fn().mockResolvedValue(),
            setupCoordinationMatrix: jest.fn(),
            ifcAPI: {
              GetCoordinationMatrix: jest.fn().mockResolvedValue(new Array(16).fill(0)),
              getStatistics: jest.fn().mockReturnValue({
                getGeometryMemory: () => 0,
                getGeometryTime: () => 0,
                getVersion: () => 'IFC4',
                getLoadStatus: () => 'SUCCESS',
                getOriginatingSystem: () => 'test',
                getPreprocessorVersion: () => '1.0',
                getParseTime: () => 0,
                getTotalTime: () => 0,
              }),
              getConwayVersion: () => '1.0.0',
            },
          },
        },
        context: {
          items: {ifcModels: []},
          fitToFrame: jest.fn(),
        },
      },
    }

    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/model.ifc',
      '',
      false,
      false,
    ])
    downloadToOPFS.mockResolvedValue(new MockFile('ISO-10303-21 fake ifc'))

    try {
      await load('https://example.com/model.ifc', ifcViewer, onProgress, true, setOpfsFile, '')
      throw new Error('expected load() to reject')
    } catch (err) {
      expect(err.isOutOfMemory).toBe(true)
      expect(ifcViewer.IFC.ifcLastError).toBe(oomErr)
    }
  })


  it('rejects a second IFC load attempt when the viewer already has a model', async () => {
    // Prime the viewer as if a model were already loaded, then kick off a
    // load for an .ifc file. findLoader will call newIfcLoader(viewer) to
    // hot-patch `viewer.IFC.parse`; that patched parse function is what
    // we want to exercise — not the normal happy path.
    const ifcLoaderBase = {
      type: null,
      addIfcModel: jest.fn(),
      ifcLastError: null,
      loader: {
        ifcManager: {
          state: {models: []},
          applyWebIfcConfig: jest.fn().mockResolvedValue(),
          setupCoordinationMatrix: jest.fn(),
          ifcAPI: {
            GetCoordinationMatrix: jest.fn().mockResolvedValue([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
            getStatistics: jest.fn().mockReturnValue({
              getGeometryMemory: () => 0,
              getGeometryTime: () => 0,
              getVersion: () => 'IFC4',
              getLoadStatus: () => 'SUCCESS',
              getOriginatingSystem: () => 'test',
              getPreprocessorVersion: () => '1.0',
              getParseTime: () => 0,
              getTotalTime: () => 0,
            }),
            getConwayVersion: () => '1.0.0',
          },
        },
        parse: jest.fn(),
      },
      context: {
        // Already-loaded model → the `if (length !== 0)` guard fires.
        items: {ifcModels: [{modelID: 0}]},
        fitToFrame: jest.fn(),
      },
    }
    const primedViewer = {IFC: ifcLoaderBase}

    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/model.ifc',
      '',
      false,
      false,
    ])
    downloadToOPFS.mockResolvedValue(new MockFile('FAKE IFC CONTENT'))

    // The guard throws, then load() catches, surfaces ifcLastError,
    // then the outer null-check throws again. We only need one of those
    // rejections to reach us.
    await expect(
      load('https://example.com/model.ifc', primedViewer, onProgress, true, setOpfsFile, ''),
    ).rejects.toThrow(/Model cannot be loaded|already present/)
  })


  it('falls back to Filetype.guessType when the filename has no valid extension', async () => {
    // A path with no recognized extension forces findLoader's catch
    // block: getValidExtension throws FilenameParseError, and the
    // recovery path calls Filetype.guessType(path). guessType does an
    // axios HEAD fetch of the first bytes of the file, which we
    // intercept here to return a byte-string analyzeHeaderStr will
    // recognize as "obj" (three leading `v X Y Z` lines).
    dereferenceAndProxyDownloadContents.mockResolvedValue([
      'https://example.com/file',
      '',
      false,
      false,
    ])
    downloadToOPFS.mockResolvedValue(new MockFile('v 0 0 0\nv 1 0 0\nv 0 1 0\n'))

    // analyzeHeader decodes the ArrayBuffer as UTF-8 and matches on the
    // header string, so the returned data has to be an ArrayBuffer whose
    // bytes decode to OBJ-like content.
    const headerBytes = new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\n').buffer
    axios.get.mockResolvedValue({data: headerBytes})

    // load() will go through the fallback, resolve to 'obj', and
    // succeed (or fail downstream — we only care that guessType fired).
    try {
      await load('https://example.com/file', viewer, onProgress, true, setOpfsFile, '')
    } catch (_) {
      // ignore — downstream parse may still fail
    }

    // axios.get must have been called with the Range header, that's
    // guessType's signature.
    expect(axios.get).toHaveBeenCalledTimes(1)
    const [, options] = axios.get.mock.calls[0]
    expect(options.headers.Range).toMatch(/^bytes=0-\d+$/)
  })
})
