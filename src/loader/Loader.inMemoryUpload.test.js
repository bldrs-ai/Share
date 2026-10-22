import fs from 'fs'
import path from 'path'
import axios from 'axios'
import {load} from './Loader'
import {registerInMemoryUpload, resetInMemoryUploadsForTest} from './inMemoryUploads'


jest.mock('axios')


/**
 * A local file opened in a browser without OPFS is held in this page's
 * memory (`inMemoryUploads.js`) and the Loader reads its bytes from there
 * (#1906). Before that, the no-OPFS path fetched `blob:<origin>/<id>`, which
 * after the opener's full page load named nothing.
 */
describe('Loader — in-memory uploads (no OPFS)', () => {
  const stlBytes = fs.readFileSync(path.resolve(__dirname, '../../testdata/models/stl/cube.stl'))

  /**
   * The parts of a picked `File` the Loader touches. jsdom 20's Blob has
   * neither `text` nor `arrayBuffer`.
   *
   * @param {string} name
   * @return {object}
   */
  function pickedFile(name) {
    return {
      name,
      text: jest.fn(() => Promise.resolve(stlBytes.toString('utf8'))),
      arrayBuffer: jest.fn(() =>
        Promise.resolve(stlBytes.buffer.slice(stlBytes.byteOffset, stlBytes.byteOffset + stlBytes.length))),
    }
  }

  /** @return {object} the minimum `load` needs for a non-IFC model */
  function makeViewer() {
    return {
      IFC: {type: null, addIfcModel: jest.fn(), loader: {ifcManager: {state: {models: []}}}},
      ifcLoader: {type: null},
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    resetInMemoryUploadsForTest()
  })

  it('loads the held file without fetching anything', async () => {
    const file = pickedFile('cube.stl')
    const storageId = registerInMemoryUpload(file, 'stl')

    // What CadView hands the Loader for /share/v/new/<id>: the route's
    // downloadUrl, the id resolved against the origin.
    const model = await load(
      `http://localhost/${storageId}`, makeViewer(), jest.fn(), false, jest.fn(), '')

    expect(model).toBeDefined()
    expect(model.isUploadedFile).toBe(true)
    expect(file.text.mock.calls.length + file.arrayBuffer.mock.calls.length).toBe(1)
    expect(axios.get).not.toHaveBeenCalled()
    // There is no recents entry to name it by; the held File's own name is
    // what the root label shows instead of the uuid.
    expect(model.name).toContain('cube.stl')
    expect(model.name).not.toContain(storageId)
  })

  // Not held here (a Drive blob URL, say): unchanged, it is still fetched.
  it('still fetches an upload-shaped path this page does not hold', async () => {
    axios.get.mockRejectedValue(new Error('network'))
    await expect(load(
      'http://localhost/12345678-1234-4abc-9def-123456789abc.stl', makeViewer(), jest.fn(), false, jest.fn(), ''),
    ).rejects.toThrow()
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringMatching(/^blob:http:\/\/localhost\/12345678-1234-4abc-9def-123456789abc\.stl$/),
      expect.anything())
  })
})
