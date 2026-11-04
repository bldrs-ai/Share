// Share#2006 at the drop seam: a dropped zip opens the model inside it.
//
// Its own file because `dragAndDrop.test.js` automocks `Filetype`, and the
// archive decisions are made BY the real sniff (`loader/modelArchive.js`):
// under that mock every drop passes through as a non-archive, which is what
// keeps those tests' expectations as they were.
import {zipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {saveDnDFileToOpfs} from '../OPFS/utils'
import {addRecentFileEntry} from '../connections/persistence'
import {getInMemoryUpload} from '../loader/inMemoryUploads'
import {ARCHIVE_ENTRY_CHOICE} from '../loader/modelArchive'
import {readZipDirectory} from '../loader/zipArchive'
import {handleFileDrop} from './dragAndDrop'


jest.mock('../OPFS/utils', () => ({
  checkOPFSAvailability: jest.fn(),
  // The worker writes under `<blob-uuid>.<type>`; the name that matters here
  // is the type, which is what `findLoader` resolves the upload by.
  saveDnDFileToOpfs: jest.fn((file, type, callback) => callback(`00000000-0000-4000-8000-000000000000.${type}`)),
}))
jest.mock('../connections/persistence')
jest.mock('./event')
// Real, but able to fail on demand the way a defect would.
jest.mock('../loader/zipArchive', () => {
  const actual = jest.requireActual('../loader/zipArchive')
  return {...actual, readZipDirectory: jest.fn(actual.readZipDirectory)}
})


const DROPPED_AT = 1_700_000_000_000


/**
 * UTF-8 in this realm's Uint8Array: fflate tells files from folders by
 * `instanceof`, and TextEncoder's arrays are Node's under jest-fixed-jsdom.
 *
 * @param {string} text
 * @return {Uint8Array}
 */
function utf8(text) {
  return new Uint8Array(new TextEncoder().encode(text))
}


const IFC = utf8('ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\n')
const GLB = utf8('glTF and its chunks')


/**
 * A drop event carrying one file — a node Blob with a name and timestamp,
 * which reads as a browser's File does (jsdom's File can't be read).
 *
 * @param {Uint8Array} bytes
 * @param {string} name
 * @return {object}
 */
function dropOf(bytes, name) {
  const file = Object.assign(new Blob([bytes]), {name, lastModified: DROPPED_AT})
  return {preventDefault: jest.fn(), dataTransfer: {files: [file]}}
}


/**
 * @param {object} event from dropOf
 * @param {object} [opts]
 * @param {boolean} [opts.hasOpfs]
 * @return {Promise<object>} the mocks handed to the drop
 */
async function drop(event, {hasOpfs = true} = {}) {
  const mocks = {navigate: jest.fn(), setAlert: jest.fn(), onSuccess: jest.fn(), onError: jest.fn()}
  await handleFileDrop(event, mocks.navigate, '/share', hasOpfs, mocks.setAlert, mocks.onSuccess, mocks.onError)
  return mocks
}


/**
 * What reached OPFS, as plain data. Asserted this way rather than with
 * `toHaveBeenCalledWith(expect.objectContaining(...))`, whose failure diff
 * deep-copies the jsdom File and aborts the Jest worker instead of printing.
 *
 * @return {Array<Array<string>>} `[name, type]` per write
 */
function storedNamesAndTypes() {
  return saveDnDFileToOpfs.mock.calls.map(([file, type]) => [file.name, type])
}


describe('handleFileDrop — archives', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('opens the one model in a dropped zip, under its own name and type', async () => {
    const {navigate, setAlert, onSuccess, onError} = await drop(dropOf(zipSync({'export/Tower.ifc': IFC}), 'Tower.zip'))
    expect(storedNamesAndTypes()).toEqual([['Tower.ifc', 'ifc']])
    expect(saveDnDFileToOpfs.mock.calls[0][0].size).toBe(IFC.length)
    // Recents and the load report read the entry's name, not the zip's.
    expect(addRecentFileEntry).toHaveBeenCalledWith(expect.objectContaining({name: 'Tower.ifc', source: 'local'}))
    expect(navigate).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000.ifc')
    expect(setAlert).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('opens a zip by its header whatever it is called', async () => {
    await drop(dropOf(zipSync({'part.glb': GLB}), 'download'))
    expect(storedNamesAndTypes()).toEqual([['part.glb', 'glb']])
  })

  it('asks which model when there are several, and opens the one chosen', async () => {
    const {setAlert, onSuccess, onError} = await drop(dropOf(zipSync({'Tower.ifc': IFC, 'part.glb': GLB}), 'models.zip'))
    expect(saveDnDFileToOpfs).not.toHaveBeenCalled()
    // The chooser is up, so the overlay that dropped it has to get out of
    // its way — as a success with no id yet, so it doesn't open Help over
    // the chooser the way its `onError` does.
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith(null)
    expect(onError).not.toHaveBeenCalled()
    const [choice] = setAlert.mock.calls[0]
    expect(choice.type).toBe(ARCHIVE_ENTRY_CHOICE)
    await choice.onChoose(choice.entries.find((e) => e.name === 'part.glb'))
    expect(storedNamesAndTypes()).toEqual([['part.glb', 'glb']])
    expect(onSuccess).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000.glb')
  })

  it('says what a dropped zip holds when it holds no model', async () => {
    const {setAlert, onError, navigate} = await drop(dropOf(zipSync({'plan.dwg': GLB, 'spec.pdf': GLB}), 'plans.zip'))
    expect(setAlert).toHaveBeenCalledWith({
      type: 'unrecognizedFormat',
      message: 'This archive has no model Share can open (it contains .dwg and .pdf).',
      ext: 'zip',
      entry: 'drop',
      archive: {exts: ['dwg', 'pdf']},
    })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(saveDnDFileToOpfs).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('ends a drop of a damaged zip in the dialog and onError', async () => {
    const zip = zipSync({'Tower.ifc': IFC})
    const {setAlert, onError, onSuccess} = await drop(dropOf(zip.subarray(0, zip.length - 10), 'Tower.zip'))
    expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({type: 'unrecognizedFormat', ext: 'zip', entry: 'drop'}))
    expect(setAlert.mock.calls[0][0].archive.problem).toMatch(/damaged or incomplete/)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
  })

  // Review of Share#2010: a failure that isn't the archive's escaped the
  // seam, so nothing told the user and the onboarding overlay stayed up.
  it('ends a drop in the dialog and onError when looking inside fails for another reason', async () => {
    const defect = new TypeError('a defect')
    readZipDirectory.mockRejectedValueOnce(defect)
    const {setAlert, onError, navigate} = await drop(dropOf(zipSync({'Tower.ifc': IFC}), 'Tower.zip'))
    expect(setAlert).toHaveBeenCalledTimes(1)
    expect(setAlert.mock.calls[0][0]).toBe(defect)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('holds the model from a dropped zip in memory without OPFS', async () => {
    const {navigate, onSuccess} = await drop(dropOf(zipSync({'Tower.ifc': IFC}), 'Tower.zip'), {hasOpfs: false})
    expect(saveDnDFileToOpfs).not.toHaveBeenCalled()
    const [storageId] = onSuccess.mock.calls[0]
    expect(storageId).toMatch(/\.ifc$/)
    expect(getInMemoryUpload(storageId).name).toBe('Tower.ifc')
    expect(navigate).toHaveBeenCalled()
  })
})
