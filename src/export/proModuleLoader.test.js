// The dynamic `import()` is the one thing this module can't do under jest
// (babel rewrites it to `require`, which can't load a blob: URL), so the
// helper module that owns it is mocked wholesale — see importModuleFromUrl.js.
const mockImportModuleFromUrl = jest.fn()
jest.mock('./importModuleFromUrl', () => ({
  importModuleFromUrl: (...args) => mockImportModuleFromUrl(...args),
}))

import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN, HTTP_INTERNAL_SERVER_ERROR, HTTP_OK} from '../net/http'
import {ProModuleDeniedError, loadProModule, resetProModuleCache} from './proModuleLoader'


describe('proModuleLoader', () => {
  const MODULE_SOURCE = 'export const format = {id: "glb"}'
  const MODULE_NAMESPACE = {format: {id: 'glb'}}
  const BLOB_URL = 'blob:http://localhost/pro-module'

  let fetchMock
  let createObjectURL
  let revokeObjectURL
  let getAccessToken

  /**
   * @param {number} status
   * @param {string} [body]
   * @return {object} a minimal fetch Response double
   */
  function response(status, body = MODULE_SOURCE) {
    return {ok: status === HTTP_OK, status, text: () => Promise.resolve(body)}
  }

  beforeEach(() => {
    resetProModuleCache()
    mockImportModuleFromUrl.mockReset()
    mockImportModuleFromUrl.mockResolvedValue(MODULE_NAMESPACE)
    fetchMock = jest.fn().mockResolvedValue(response(HTTP_OK))
    global.fetch = fetchMock
    createObjectURL = jest.fn().mockReturnValue(BLOB_URL)
    revokeObjectURL = jest.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    getAccessToken = jest.fn().mockResolvedValue('test-token')
  })

  it('fetches with a Bearer token and imports the module from a blob URL', async () => {
    const namespace = await loadProModule('glbExport', getAccessToken)

    expect(namespace).toBe(MODULE_NAMESPACE)
    expect(fetchMock).toHaveBeenCalledWith(
      '/.netlify/functions/pro-module?name=glbExport',
      {headers: {Authorization: 'Bearer test-token'}},
    )
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(mockImportModuleFromUrl).toHaveBeenCalledWith(BLOB_URL)
  })

  it('revokes the blob URL once the import settles', async () => {
    // The URL is a live handle to the premium source for as long as it
    // exists (design/new/glb-export-premium.md §4.6), so leaving it around
    // is the leak this asserts against — on the failure path too.
    await loadProModule('glbExport', getAccessToken)
    expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL)

    resetProModuleCache()
    revokeObjectURL.mockClear()
    mockImportModuleFromUrl.mockRejectedValueOnce(new Error('syntax error'))
    await expect(loadProModule('glbExport', getAccessToken)).rejects.toThrow('syntax error')
    expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL)
  })

  it('memoises per name, so a second export costs no request', async () => {
    const first = await loadProModule('glbExport', getAccessToken)
    const second = await loadProModule('glbExport', getAccessToken)

    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockImportModuleFromUrl).toHaveBeenCalledTimes(1)
  })

  it('shares one fetch between concurrent callers', async () => {
    const [a, b] = await Promise.all([
      loadProModule('glbExport', getAccessToken),
      loadProModule('glbExport', getAccessToken),
    ])

    expect(a).toBe(b)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['401 (no/invalid token)', HTTP_AUTHORIZATION_REQUIRED],
    ['403 (not subscribed)', HTTP_FORBIDDEN],
  ])('throws ProModuleDeniedError carrying the status on %s', async (_label, status) => {
    fetchMock.mockResolvedValue(response(status, 'denied'))

    const error = await loadProModule('glbExport', getAccessToken).catch((e) => e)

    expect(error).toBeInstanceOf(ProModuleDeniedError)
    expect(error.status).toBe(status)
    expect(error.name).toBe('ProModuleDeniedError')
    expect(mockImportModuleFromUrl).not.toHaveBeenCalled()
  })

  it('does not memoise a denial, so an upgraded user can retry', async () => {
    fetchMock.mockResolvedValueOnce(response(HTTP_FORBIDDEN, 'denied'))
    await expect(loadProModule('glbExport', getAccessToken)).rejects.toBeInstanceOf(ProModuleDeniedError)

    // Same page, now subscribed: the second attempt must reach the server.
    const namespace = await loadProModule('glbExport', getAccessToken)
    expect(namespace).toBe(MODULE_NAMESPACE)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('distinguishes a server error from a denial', async () => {
    fetchMock.mockResolvedValue(response(HTTP_INTERNAL_SERVER_ERROR, 'boom'))

    const error = await loadProModule('glbExport', getAccessToken).catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ProModuleDeniedError)
  })

  it('omits the Authorization header when there is no token getter', async () => {
    // The anonymous case: the request still goes out (the server, not the
    // client, decides) and comes back 401.
    fetchMock.mockResolvedValue(response(HTTP_AUTHORIZATION_REQUIRED, 'denied'))

    await expect(loadProModule('glbExport')).rejects.toBeInstanceOf(ProModuleDeniedError)
    expect(fetchMock).toHaveBeenCalledWith(
      '/.netlify/functions/pro-module?name=glbExport', {headers: {}})
  })
})
