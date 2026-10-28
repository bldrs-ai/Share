// The dynamic `import()` is the one thing this module can't do under jest
// (babel rewrites it to `require`, which can't load a blob: URL), so the
// helper module that owns it is mocked wholesale — see importModuleFromUrl.js.
const mockImportModuleFromUrl = jest.fn()
jest.mock('./importModuleFromUrl', () => ({
  importModuleFromUrl: (...args) => mockImportModuleFromUrl(...args),
}))

import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN, HTTP_INTERNAL_SERVER_ERROR, HTTP_OK} from '../net/http'
import {ProModuleDeniedError, forgetProModule, loadProModule, resetProModuleCache} from './proModuleLoader'


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
   * @param {object} [headers] response headers, by name
   * @return {object} a minimal fetch Response double
   */
  function response(status, body = MODULE_SOURCE, headers = {}) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
    return {
      ok: status === HTTP_OK,
      status,
      text: () => Promise.resolve(body),
      headers: {get: (name) => lower[name.toLowerCase()] ?? null},
    }
  }

  // What pro-module sends a free user with the module: the slots after the
  // delivery, and whether it took one.
  const SLOTS_AFTER = {limit: 2, used: 1, remaining: 1, nextFreeAt: '2026-11-03T12:00:00.000Z', taken: true}
  const FREE_DELIVERY = {'X-Bldrs-Model-Slots': JSON.stringify(SLOTS_AFTER)}
  const MODEL_A = '/share/v/local-only/0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc'
  const MODEL_B = '/share/v/gh/acme/private/main/Gebäude.ifc'

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
    const {namespace, slots} = await loadProModule('glbExport', getAccessToken)

    expect(namespace).toBe(MODULE_NAMESPACE)
    expect(slots).toBeNull()
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

  it('memoises a Pro delivery per name, so a second export costs no request', async () => {
    const first = await loadProModule('glbExport', getAccessToken)
    const second = await loadProModule('glbExport', getAccessToken)

    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockImportModuleFromUrl).toHaveBeenCalledTimes(1)
  })

  it('fetches afresh after forgetProModule, for a Pro module the server stopped standing behind', async () => {
    await loadProModule('glbExport', getAccessToken)
    forgetProModule('glbExport')
    await loadProModule('glbExport', getAccessToken)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends the model\'s slot key, encoded, so a path a raw header cannot carry still goes', async () => {
    await loadProModule('glbExport', getAccessToken, MODEL_B)

    expect(fetchMock).toHaveBeenCalledWith('/.netlify/functions/pro-module?name=glbExport', {headers: {
      'Authorization': 'Bearer test-token',
      'X-Bldrs-Model-Key': encodeURIComponent(MODEL_B),
    }})
  })

  describe('a free-tier delivery (granted for one model)', () => {
    it('reports the slots the server sent with it', async () => {
      fetchMock.mockResolvedValue(response(HTTP_OK, MODULE_SOURCE, FREE_DELIVERY))

      const {namespace, slots} = await loadProModule('glbExport', getAccessToken, MODEL_A)

      expect(namespace).toBe(MODULE_NAMESPACE)
      expect(slots).toEqual(SLOTS_AFTER)
    })

    it('is NOT memoised: the next export, of this model or another, asks the server again', async () => {
      // The soft spot this closes (glb-export-premium.md §4.8): a memoised
      // free delivery would export the next model without the server ever
      // asking whether it holds a slot.
      fetchMock.mockResolvedValue(response(HTTP_OK, MODULE_SOURCE, FREE_DELIVERY))

      await loadProModule('glbExport', getAccessToken, MODEL_A)
      await loadProModule('glbExport', getAccessToken, MODEL_A)
      await loadProModule('glbExport', getAccessToken, MODEL_B)

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('is still not memoised when the slots header is unreadable', async () => {
      fetchMock.mockResolvedValue(response(HTTP_OK, MODULE_SOURCE, {'X-Bldrs-Model-Slots': 'not json'}))

      const {slots} = await loadProModule('glbExport', getAccessToken, MODEL_A)
      await loadProModule('glbExport', getAccessToken, MODEL_A)

      expect(slots).toEqual({})
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('never lets a request for one model ride on the answer about another', async () => {
      fetchMock.mockResolvedValue(response(HTTP_OK, MODULE_SOURCE, FREE_DELIVERY))

      await Promise.all([
        loadProModule('glbExport', getAccessToken, MODEL_A),
        loadProModule('glbExport', getAccessToken, MODEL_B),
      ])

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
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
    const {namespace} = await loadProModule('glbExport', getAccessToken)
    expect(namespace).toBe(MODULE_NAMESPACE)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('distinguishes a server error from a denial', async () => {
    fetchMock.mockResolvedValue(response(HTTP_INTERNAL_SERVER_ERROR, 'boom'))

    const error = await loadProModule('glbExport', getAccessToken).catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ProModuleDeniedError)
    // A non-JSON body — Netlify's own failure page, say — is carried as its
    // first line, so "crashed" and "timed out" reach Sentry too.
    expect(error.message).toBe('Pro module "glbExport" failed to load (500: boom)')
  })

  it('folds the function\'s own diagnosis into the error', async () => {
    // What #1837's smoke handed Sentry was the status alone, and a 502 is
    // the same number whether the function named a Management API step or
    // never ran. The function's body says which (pro-module.js), and this is
    // where it becomes the message the capture carries.
    const HTTP_BAD_GATEWAY = 502
    fetchMock.mockResolvedValue(response(HTTP_BAD_GATEWAY, JSON.stringify({
      error: 'app_metadata_lookup_failed', step: 'mgmt_config', upstreamStatus: null, missing: ['AUTH0_CLIENT_SECRET'],
    })))

    const error = await loadProModule('glbExport', getAccessToken).catch((e) => e)

    expect(error.message).toBe(
      'Pro module "glbExport" failed to load (502: app_metadata_lookup_failed at mgmt_config, unset AUTH0_CLIENT_SECRET)')
  })

  it('carries the server\'s reason on a denial as well', async () => {
    fetchMock.mockResolvedValue(response(HTTP_FORBIDDEN, JSON.stringify({error: 'subscription_required'})))

    const error = await loadProModule('glbExport', getAccessToken).catch((e) => e)

    expect(error).toBeInstanceOf(ProModuleDeniedError)
    expect(error.message).toBe('Pro module "glbExport" denied (403: subscription_required)')
    expect(error.reason).toBe('subscription_required')
    expect(error.modelSlots).toBeNull()
  })

  it('hands a free user\'s slots-full refusal its slots, for the "next slot frees up" line', async () => {
    const modelSlots = {limit: 2, used: 2, remaining: 0, nextFreeAt: '2026-10-31T09:00:00.000Z', keys: [MODEL_B, '/share/v/g/x']}
    fetchMock.mockResolvedValue(response(HTTP_FORBIDDEN, JSON.stringify({error: 'no_free_model_slot', modelSlots})))

    const error = await loadProModule('glbExport', getAccessToken, MODEL_A).catch((e) => e)

    expect(error).toBeInstanceOf(ProModuleDeniedError)
    expect(error.reason).toBe('no_free_model_slot')
    expect(error.modelSlots).toEqual(modelSlots)
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
