import {DecompressionStream as NodeDecompressionStream} from 'node:stream/web'
import {gzipSync} from 'node:zlib'
import {opfsWriteModel} from '../OPFS/OPFSService.js'
import {loadLocalFile, loadLocalFileFallback, saveDnDFileToOpfsFallback} from './loader'


// The OPFS worker is a real shared worker in the browser; what matters here
// is the storage name the file is written under, which is the `/v/new/`
// segment `findLoader` later resolves the upload by.
jest.mock('../OPFS/OPFSService.js', () => ({
  initializeWorker: jest.fn(() => ({addEventListener: jest.fn(), removeEventListener: jest.fn()})),
  nextRequestId: jest.fn(() => 7),
  opfsWriteModel: jest.fn(),
}))


/**
 * The change listener is async since it sniffs (and may inflate) the picked
 * file, so a dispatch returns before it has finished. Macrotasks rather than
 * a microtask flush, because the reads and the decompression stream settle on
 * real turns; there are no fake timers here for that to fight with.
 *
 * @return {Promise<void>}
 */
async function flushPick() {
  // Several hops, not one: on the compressed path the sniff, the full read
  // and the `DecompressionStream` round trip each settle on their own turn.
  const TURNS = 10
  for (let i = 0; i < TURNS; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}


/**
 * A picked file with the surface this code reads: `slice().arrayBuffer()` for
 * the header sniff. jsdom's own `File` has neither under
 * `jest-fixed-jsdom`, while the global `Blob` (node's) has both, as a
 * browser's File does.
 *
 * @param {Uint8Array} bytes
 * @param {string} name
 * @return {Blob} with a `name` and `lastModified`, as a File has
 */
function pickedFile(bytes, name) {
  return Object.assign(new Blob([bytes]), {name, lastModified: PICKED_AT})
}


const PICKED_AT = 1_700_000_000_000
// Enough of a GLB to sniff: the magic is the first four bytes.
const GLB_BYTES = new TextEncoder().encode('glTFand the chunks after it')
// Not the head of any format the sniffer knows, and not valid UTF-8 either.
const UNRECOGNIZABLE_BYTE = 0xff
const UNRECOGNIZABLE_BYTES = new Uint8Array([UNRECOGNIZABLE_BYTE, 0])


describe('loadLocalFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Set up DOM
    document.body.innerHTML = `<div id="viewer-container"></div>`
    URL.createObjectURL = jest.fn(() => 'testId')
    URL.revokeObjectURL = jest.fn()
    // jsdom implements no `DecompressionStream`; Node's is the same WHATWG
    // interface the browser gives, so the `.glb.gz` pick below really is
    // inflated rather than stubbed.
    global.DecompressionStream = NodeDecompressionStream
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete global.DecompressionStream
  })

  it('loads a local file and navigates to the appropriate URL', async () => {
    const onLoad = jest.fn()
    loadLocalFile(onLoad, true, true)

    // Mock input change event with a file
    const inputElement = document.querySelector('input[type="file"]')
    const file = pickedFile(new TextEncoder().encode('dummy'), 'test.ifc')
    Object.defineProperty(inputElement, 'files', {value: [file]})

    const event = new Event('change', {bubbles: true})
    inputElement.dispatchEvent(event)
    await flushPick()

    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
    // Third arg is the user's filename — callers keep it as the recents
    // display name while navigating by the storage id (#1682).
    expect(onLoad).toHaveBeenCalledWith('testId', expect.any(Number), 'test.ifc')
  })

  it('revokes the object URL when the worker is disabled (fallback path)', async () => {
    // When testingDisableWebWorker=true the worker path is skipped
    // and onLoad fires as soon as the pick is resolved; the revoke must
    // happen by then so the underlying blob isn't pinned in memory.
    const onLoad = jest.fn()
    loadLocalFile(onLoad, true, true)

    const inputElement = document.querySelector('input[type="file"]')
    Object.defineProperty(inputElement, 'files',
      {value: [pickedFile(new TextEncoder().encode('dummy'), 'test.ifc')]})
    inputElement.dispatchEvent(new Event('change', {bubbles: true}))
    await flushPick()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('testId')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('throws an error if viewer-container is missing', () => {
    document.body.innerHTML = ''
    expect(() => {
      loadLocalFile(jest.fn(), true, true)
    }).toThrow()
  })

  it('stores a picked .glb.gz as the GLB inside it', async () => {
    // The round trip (#1831), through the Open dialog's Local tab. Two
    // things have to be true of what reaches OPFS: the storage extension is
    // the model's — `.gz` names no loader and `split('.').pop()` used to
    // produce exactly that — and the display name is still the user's own.
    const onLoad = jest.fn()
    loadLocalFile(onLoad, true)

    const inputElement = document.querySelector('input[type="file"]')
    const gzipped = new Uint8Array(gzipSync(Buffer.from(GLB_BYTES)))
    const picked = pickedFile(gzipped, 'index.glb.gz')
    Object.defineProperty(inputElement, 'files', {value: [picked]})
    inputElement.dispatchEvent(new Event('change', {bubbles: true}))
    await flushPick()

    // Storage id `<blob-uuid>.glb`, display name the user's own `.glb.gz`.
    expect(opfsWriteModel).toHaveBeenCalledWith('testId', 'index.glb.gz', 'testId.glb', 7)
    // The blob URL is all the worker gets, so it is where the inflate has to
    // have happened: what that URL resolves to must be the GLB and not the
    // gzip member — same length as the source bytes, and not the picked file.
    const written = URL.createObjectURL.mock.calls[0][0]
    expect(written).not.toBe(picked)
    expect(written.size).toBe(GLB_BYTES.byteLength)
  })

  it('stores a pick whose name names no format under what its header says', async () => {
    // "Cannot extract filetype from filename" was thrown for any name the
    // last-dot split could not parse — a download that lost its extension,
    // a file called just `.gz`. The header answers both.
    const onLoad = jest.fn()
    loadLocalFile(onLoad, true)

    const inputElement = document.querySelector('input[type="file"]')
    Object.defineProperty(inputElement, 'files', {value: [pickedFile(GLB_BYTES, 'download')]})
    inputElement.dispatchEvent(new Event('change', {bubbles: true}))
    await flushPick()

    expect(opfsWriteModel).toHaveBeenCalledWith('testId', 'download', 'testId.glb', 7)
  })

  it('reports a pick no name and no header can identify, and writes nothing', async () => {
    // The picker has already closed, so without `onError` nothing would tell
    // the user why their file did not open.
    const onError = jest.fn()
    loadLocalFile(jest.fn(), true, false, onError)

    const inputElement = document.querySelector('input[type="file"]')
    Object.defineProperty(inputElement, 'files',
      {value: [pickedFile(UNRECOGNIZABLE_BYTES, 'mystery')]})
    inputElement.dispatchEvent(new Event('change', {bubbles: true}))
    await flushPick()

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Cannot extract filetype'))
    expect(opfsWriteModel).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('testId')
  })

  it('removes the file input after click if skipAutoRemove is false', () => {
    loadLocalFile(jest.fn(), false, true)
    const inputElement = document.querySelector('input[type="file"]')
    expect(inputElement).toBeNull()
  })
})


describe('loadLocalFileFallback', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="viewer-container"></div>`
    URL.createObjectURL = jest.fn(() => 'testId')
    URL.revokeObjectURL = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('revokes the object URL after extracting the blob id', () => {
    const onLoad = jest.fn()
    loadLocalFileFallback(onLoad, true)

    const inputElement = document.querySelector('input[type="file"]')
    Object.defineProperty(inputElement, 'files', {value: [new File(['dummy'], 'test.ifc')]})
    inputElement.dispatchEvent(new Event('change', {bubbles: true}))

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('testId')
    expect(onLoad).toHaveBeenCalledWith('testId', expect.any(Number), 'test.ifc')
  })
})


describe('saveDnDFileToOpfsFallback', () => {
  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'http://localhost/blob/abc123')
    URL.revokeObjectURL = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('revokes the object URL before invoking the callback', () => {
    let revokeCalledBeforeCallback = false
    const callback = jest.fn(() => {
      revokeCalledBeforeCallback = URL.revokeObjectURL.mock.calls.length > 0
    })
    saveDnDFileToOpfsFallback(new File(['dummy'], 'test.ifc'), callback)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('http://localhost/blob/abc123')
    expect(callback).toHaveBeenCalledWith('abc123')
    expect(revokeCalledBeforeCallback).toBe(true)
  })
})
