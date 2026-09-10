import {hydrateExports, loadExports, recordExport, saveExports, subscribeToExports} from './exportHistory'


const SUB = 'github|1234567'
const OTHER_SUB = 'google-oauth2|7654321'
const KEY = '/share/v/p/index.ifc'
const CACHE_KEY_ARGS = {
  ns1: 'BldrsLocalStorage',
  ns2: 'V1',
  ns3: 'Projects',
  sourcePath: 'index.ifc',
  sourceHash: 'sha123',
}
const SCHEMA_VER = '0.21.0-batched'
const EXPORTS_CAP = 100


/**
 * @param {object} [overrides]
 * @return {object} an entry for recordExport
 */
function anEntry(overrides = {}) {
  return {
    key: KEY,
    format: 'glb',
    bytes: 2048,
    title: 'index.ifc',
    cacheKeyArgs: CACHE_KEY_ARGS,
    schemaVer: SCHEMA_VER,
    options: {stripBldrsMetadata: true},
    ...overrides,
  }
}


/**
 * @param {number} count
 * @return {Array<object>} `count` stored rows, newest first
 */
function storedRows(count) {
  return Array.from({length: count}, (_, i) => ({
    id: `old-${i}`,
    key: `/share/v/p/model-${i}.ifc`,
    title: null,
    format: 'glb',
    bytes: i,
    exportedAt: '2020-01-01T00:00:00.000Z',
  }))
}


describe('exportHistory', () => {
  // OPFS stand-in keyed by FILE NAME, because the name is the isolation
  // mechanism under test: one account's rows must be unreachable through
  // another account's read (§4.5).
  let files
  let getFileHandle
  let isOpfsAvailable

  /**
   * @param {string} sub Auth0 subject
   * @return {?string} raw JSON this account's mirror holds, if any
   */
  function storedFor(sub) {
    return files.get(`exports.${encodeURIComponent(sub)}.json`) ?? null
  }

  beforeEach(() => {
    files = new Map()
    isOpfsAvailable = true
    getFileHandle = jest.fn((name, {create}) => {
      if (!files.has(name) && !create) {
        return Promise.reject(new Error('not found'))
      }
      return Promise.resolve({
        getFile: () => files.has(name) ?
          Promise.resolve({text: () => Promise.resolve(files.get(name))}) :
          Promise.reject(new Error('not found')),
        createWritable: () => Promise.resolve({
          write: (data) => {
            files.set(name, data)
            return Promise.resolve()
          },
          close: () => Promise.resolve(),
        }),
      })
    })
    Object.defineProperty(global, 'navigator', {
      value: {
        storage: {
          getDirectory: jest.fn(() => isOpfsAvailable ?
            Promise.resolve({getFileHandle}) :
            Promise.reject(new Error('OPFS unavailable'))),
        },
      },
      configurable: true,
    })
    global.fetch = jest.fn()
  })

  describe('loadExports / saveExports', () => {
    it('returns an empty history when nothing has been exported', async () => {
      expect(await loadExports(SUB)).toEqual({exports: []})
    })

    it('persists and reads back', async () => {
      const rows = storedRows(2)

      await saveExports(SUB, rows)

      expect(await loadExports(SUB)).toEqual({exports: rows})
    })

    it('returns the empty default for a corrupt or non-list payload', async () => {
      files.set(`exports.${encodeURIComponent(SUB)}.json`, JSON.stringify({exports: 'not-a-list'}))

      expect(await loadExports(SUB)).toEqual({exports: []})
    })

    it('keeps each account\'s history in its own file', async () => {
      // OPFS is partitioned per ORIGIN, so a second Auth0 account on the same
      // browser shares this storage. Its history — titles, share paths, and
      // the cacheKeyArgs that unlock "Download again" against the first
      // account's cached artifacts — must not be visible here (§4.5).
      await saveExports(SUB, storedRows(2))
      await saveExports(OTHER_SUB, [storedRows(1)[0]])

      expect((await loadExports(SUB)).exports).toHaveLength(2)
      expect((await loadExports(OTHER_SUB)).exports).toHaveLength(1)
      expect(storedFor(SUB)).not.toBe(storedFor(OTHER_SUB))
    })

    it('reads empty and writes nothing when nobody is signed in', async () => {
      await saveExports(null, storedRows(1))

      expect(getFileHandle).not.toHaveBeenCalled()
      expect(await loadExports(null)).toEqual({exports: []})
    })

    it('notifies subscribers on every write, until unsubscribed', async () => {
      const cb = jest.fn()
      const unsubscribe = subscribeToExports(SUB, cb)

      await saveExports(SUB, storedRows(1))
      expect(cb).toHaveBeenCalledWith({exports: storedRows(1)})

      unsubscribe()
      await saveExports(SUB, storedRows(2))
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('notifies only the subscribers watching the account that was written', async () => {
      const cb = jest.fn()
      const otherCb = jest.fn()
      const unsubscribe = subscribeToExports(SUB, cb)
      const unsubscribeOther = subscribeToExports(OTHER_SUB, otherCb)

      await saveExports(SUB, storedRows(1))

      expect(cb).toHaveBeenCalledWith({exports: storedRows(1)})
      expect(otherCb).not.toHaveBeenCalled()

      unsubscribe()
      unsubscribeOther()
    })

    it('degrades to in-memory notification when OPFS is unavailable', async () => {
      isOpfsAvailable = false
      const cb = jest.fn()
      const unsubscribe = subscribeToExports(SUB, cb)

      // Neither call may reject: OPFS being absent (private browsing) must
      // not take down a feature whose file is already in Downloads.
      await saveExports(SUB, storedRows(1))
      expect(cb).toHaveBeenCalledWith({exports: storedRows(1)})
      expect(await loadExports(SUB)).toEqual({exports: []})

      unsubscribe()
    })
  })


  describe('hydrateExports', () => {
    const serverRow = {
      id: 'server-1', key: KEY, title: 'index.ifc', format: 'glb',
      bytes: 2048, exportedAt: '2026-01-01T00:00:00.000Z',
    }
    const otherServerRow = {
      id: 'server-2', key: '/share/v/p/other.ifc', title: null, format: 'glb',
      bytes: 1, exportedAt: '2025-01-01T00:00:00.000Z',
    }

    it('seeds an empty mirror from the account\'s server history', async () => {
      // New device, or OPFS cleared: the rows only exist in the JWT's
      // app_metadata claim until something writes them down here.
      const {exports} = await hydrateExports(SUB, [serverRow, otherServerRow])

      expect(exports.map((e) => e.id)).toEqual(['server-1', 'server-2'])
      expect(JSON.parse(storedFor(SUB)).exports).toHaveLength(2)
    })

    it('keeps the local artifact fields, so a hydrated row can still re-download', async () => {
      await recordExport(anEntry(), SUB)

      const {exports} = await hydrateExports(SUB, [serverRow])

      expect(exports[0]).toMatchObject({
        id: 'server-1',
        cacheKeyArgs: CACHE_KEY_ARGS,
        schemaVer: SCHEMA_VER,
        options: {stripBldrsMetadata: true},
      })
    })

    it('leaves the mirror alone when the claim carries no exports', async () => {
      // An account whose JWT predates the feature, or which has never
      // exported, must not have its local rows wiped by the catch-up.
      await recordExport(anEntry(), SUB)

      const {exports} = await hydrateExports(SUB, undefined)

      expect(exports).toHaveLength(1)
      expect(exports[0]).toMatchObject({key: KEY})
    })

    it('writes nothing for a signed-out caller', async () => {
      expect(await hydrateExports(null, [serverRow])).toEqual({exports: []})
      expect(getFileHandle).not.toHaveBeenCalled()
    })
  })

  describe('recordExport', () => {
    it('writes the row locally before the server has answered', async () => {
      // The download is already in the user's Downloads folder by the time
      // this runs, so the history must show it without waiting on a network
      // round trip. Hang the fetch and assert through the subscriber, which
      // fires from the optimistic write itself — a fixed number of
      // microtask ticks would only accidentally line up with the awaits.
      let resolveFetch
      global.fetch.mockReturnValue(new Promise((resolve) => {
        resolveFetch = resolve
      }))
      let onFirstWrite
      const written = new Promise((resolve) => {
        onFirstWrite = resolve
      })
      const unsubscribe = subscribeToExports(SUB, onFirstWrite)

      const pending = recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'))

      expect((await written).exports[0]).toMatchObject({key: KEY, format: 'glb', bytes: 2048})
      unsubscribe()
      resolveFetch({ok: true, status: 200, json: () => Promise.resolve({exports: []})})
      await pending
    })

    it('never sends the local-only artifact fields to the server', async () => {
      global.fetch.mockResolvedValue({ok: true, status: 200, json: () => Promise.resolve({exports: []})})

      await recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'))

      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body).toEqual({key: KEY, format: 'glb', bytes: 2048, title: 'index.ifc'})
    })

    it('keeps the options the export ran with on the local row', async () => {
      // The row's size describes the file that was produced. Without the
      // options, "Download again" re-runs with the DEFAULTS — so a user who
      // stripped the BLDRS_* payloads gets them back, in a bigger file than
      // the row claims (§4.5).
      const {exports} = await recordExport(anEntry({options: {stripBldrsMetadata: true}}), SUB)

      expect(exports[0].options).toEqual({stripBldrsMetadata: true})
      expect(JSON.parse(storedFor(SUB)).exports[0].options).toEqual({stripBldrsMetadata: true})
    })

    it('mirrors the server list over the local one, keeping the artifact fields', async () => {
      // The server's row is authoritative (it may carry rows from another
      // device) but knows nothing about THIS browser's OPFS artifact.
      const serverRow = {
        id: 'server-id', key: KEY, title: 'index.ifc', format: 'glb',
        bytes: 2048, exportedAt: '2026-01-01T00:00:00.000Z',
      }
      const otherDeviceRow = {
        id: 'elsewhere', key: '/share/v/p/other.ifc', title: null, format: 'glb',
        bytes: 1, exportedAt: '2025-01-01T00:00:00.000Z',
      }
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({exports: [serverRow, otherDeviceRow]}),
      })
      const refreshToken = jest.fn().mockResolvedValue('fresh')

      const result = await recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'), refreshToken)

      expect(result.recorded).toBe(true)
      const stored = (await loadExports(SUB)).exports
      expect(stored).toHaveLength(2)
      expect(stored[0]).toMatchObject({
        id: 'server-id',
        cacheKeyArgs: CACHE_KEY_ARGS,
        schemaVer: SCHEMA_VER,
        options: {stripBldrsMetadata: true},
      })
      // A row this browser never wrote gets no artifact fields invented for it.
      expect(stored[1]).toEqual(otherDeviceRow)
      // The JWT carries app_metadata, so other readers need the new one.
      expect(refreshToken).toHaveBeenCalled()
    })

    it('keeps the local row and reports the status when the server refuses', async () => {
      global.fetch.mockResolvedValue({ok: false, status: 403, json: () => Promise.resolve({error: 'x'})})

      const result = await recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'))

      expect(result).toMatchObject({recorded: false, status: 403})
      expect((await loadExports(SUB)).exports[0]).toMatchObject({key: KEY})
    })

    it('keeps the local row when the network is down', async () => {
      global.fetch.mockRejectedValue(new Error('offline'))

      const result = await recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'))

      expect(result.recorded).toBe(false)
      expect(result.status).toBeUndefined()
      expect((await loadExports(SUB)).exports[0]).toMatchObject({key: KEY})
    })

    it('keeps the local row on a 5xx', async () => {
      global.fetch.mockResolvedValue({ok: false, status: 502, json: () => Promise.reject(new Error('html'))})

      const result = await recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'))

      expect(result).toMatchObject({recorded: false, status: 502})
      expect((await loadExports(SUB)).exports[0]).toMatchObject({key: KEY})
    })

    it('records locally without a server call when there is no token source', async () => {
      const result = await recordExport(anEntry(), SUB)

      expect(global.fetch).not.toHaveBeenCalled()
      expect(result.recorded).toBe(false)
      expect(result.exports[0]).toMatchObject({key: KEY})
    })

    it('does not reject when OPFS is unavailable', async () => {
      isOpfsAvailable = false
      global.fetch.mockResolvedValue({ok: true, status: 200, json: () => Promise.resolve({exports: []})})

      await expect(recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'))).resolves.toBeDefined()
    })

    it('orders newest first', async () => {
      await saveExports(SUB, storedRows(1))

      const {exports} = await recordExport(anEntry(), SUB)

      expect(exports[0].key).toBe(KEY)
      expect(exports[1].id).toBe('old-0')
    })

    it(`caps the local list at ${EXPORTS_CAP}, dropping the oldest`, async () => {
      await saveExports(SUB, storedRows(EXPORTS_CAP))

      const {exports} = await recordExport(anEntry(), SUB)

      expect(exports).toHaveLength(EXPORTS_CAP)
      expect(exports[0].key).toBe(KEY)
      expect(exports[exports.length - 1].id).toBe(`old-${EXPORTS_CAP - 2}`)
      expect(exports.some((e) => e.id === `old-${EXPORTS_CAP - 1}`)).toBe(false)
    })
  })
})
