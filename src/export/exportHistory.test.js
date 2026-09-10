import {loadExports, recordExport, saveExports, subscribeToExports} from './exportHistory'


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
  let store
  let isOpfsAvailable

  beforeEach(() => {
    store = null
    isOpfsAvailable = true
    const mockWritable = {
      write: jest.fn((data) => {
        store = data
        return Promise.resolve()
      }),
      close: jest.fn(() => Promise.resolve()),
    }
    const mockHandle = {
      getFile: jest.fn(() => Promise.resolve({
        text: () => store === null ? Promise.reject(new Error('not found')) : Promise.resolve(store),
      })),
      createWritable: jest.fn(() => Promise.resolve(mockWritable)),
    }
    Object.defineProperty(global, 'navigator', {
      value: {
        storage: {
          getDirectory: jest.fn(() => isOpfsAvailable ?
            Promise.resolve({getFileHandle: jest.fn(() => Promise.resolve(mockHandle))}) :
            Promise.reject(new Error('OPFS unavailable'))),
        },
      },
      configurable: true,
    })
    global.fetch = jest.fn()
  })

  describe('loadExports / saveExports', () => {
    it('returns an empty history when nothing has been exported', async () => {
      expect(await loadExports()).toEqual({exports: []})
    })

    it('persists and reads back', async () => {
      const rows = storedRows(2)

      await saveExports(rows)

      expect(await loadExports()).toEqual({exports: rows})
    })

    it('returns the empty default for a corrupt or non-list payload', async () => {
      store = JSON.stringify({exports: 'not-a-list'})

      expect(await loadExports()).toEqual({exports: []})
    })

    it('notifies subscribers on every write, until unsubscribed', async () => {
      const cb = jest.fn()
      const unsubscribe = subscribeToExports(cb)

      await saveExports(storedRows(1))
      expect(cb).toHaveBeenCalledWith({exports: storedRows(1)})

      unsubscribe()
      await saveExports(storedRows(2))
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('degrades to in-memory notification when OPFS is unavailable', async () => {
      isOpfsAvailable = false
      const cb = jest.fn()
      const unsubscribe = subscribeToExports(cb)

      // Neither call may reject: OPFS being absent (private browsing) must
      // not take down a feature whose file is already in Downloads.
      await saveExports(storedRows(1))
      expect(cb).toHaveBeenCalledWith({exports: storedRows(1)})
      expect(await loadExports()).toEqual({exports: []})

      unsubscribe()
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
      const unsubscribe = subscribeToExports(onFirstWrite)

      const pending = recordExport(anEntry(), jest.fn().mockResolvedValue('token'))

      expect((await written).exports[0]).toMatchObject({key: KEY, format: 'glb', bytes: 2048})
      unsubscribe()
      resolveFetch({ok: true, status: 200, json: () => Promise.resolve({exports: []})})
      await pending
    })

    it('never sends the local-only artifact fields to the server', async () => {
      global.fetch.mockResolvedValue({ok: true, status: 200, json: () => Promise.resolve({exports: []})})

      await recordExport(anEntry(), jest.fn().mockResolvedValue('token'))

      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body).toEqual({key: KEY, format: 'glb', bytes: 2048, title: 'index.ifc'})
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

      const result = await recordExport(anEntry(), jest.fn().mockResolvedValue('token'), refreshToken)

      expect(result.recorded).toBe(true)
      const stored = (await loadExports()).exports
      expect(stored).toHaveLength(2)
      expect(stored[0]).toMatchObject({id: 'server-id', cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER})
      // A row this browser never wrote gets no artifact fields invented for it.
      expect(stored[1]).toEqual(otherDeviceRow)
      // The JWT carries app_metadata, so other readers need the new one.
      expect(refreshToken).toHaveBeenCalled()
    })

    it('keeps the local row and reports the status when the server refuses', async () => {
      global.fetch.mockResolvedValue({ok: false, status: 403, json: () => Promise.resolve({error: 'x'})})

      const result = await recordExport(anEntry(), jest.fn().mockResolvedValue('token'))

      expect(result).toMatchObject({recorded: false, status: 403})
      expect((await loadExports()).exports[0]).toMatchObject({key: KEY})
    })

    it('keeps the local row when the network is down', async () => {
      global.fetch.mockRejectedValue(new Error('offline'))

      const result = await recordExport(anEntry(), jest.fn().mockResolvedValue('token'))

      expect(result.recorded).toBe(false)
      expect(result.status).toBeUndefined()
      expect((await loadExports()).exports[0]).toMatchObject({key: KEY})
    })

    it('keeps the local row on a 5xx', async () => {
      global.fetch.mockResolvedValue({ok: false, status: 502, json: () => Promise.reject(new Error('html'))})

      const result = await recordExport(anEntry(), jest.fn().mockResolvedValue('token'))

      expect(result).toMatchObject({recorded: false, status: 502})
      expect((await loadExports()).exports[0]).toMatchObject({key: KEY})
    })

    it('records locally without a server call when there is no token source', async () => {
      const result = await recordExport(anEntry())

      expect(global.fetch).not.toHaveBeenCalled()
      expect(result.recorded).toBe(false)
      expect(result.exports[0]).toMatchObject({key: KEY})
    })

    it('does not reject when OPFS is unavailable', async () => {
      isOpfsAvailable = false
      global.fetch.mockResolvedValue({ok: true, status: 200, json: () => Promise.resolve({exports: []})})

      await expect(recordExport(anEntry(), jest.fn().mockResolvedValue('token'))).resolves.toBeDefined()
    })

    it('orders newest first', async () => {
      await saveExports(storedRows(1))

      const {exports} = await recordExport(anEntry())

      expect(exports[0].key).toBe(KEY)
      expect(exports[1].id).toBe('old-0')
    })

    it(`caps the local list at ${EXPORTS_CAP}, dropping the oldest`, async () => {
      await saveExports(storedRows(EXPORTS_CAP))

      const {exports} = await recordExport(anEntry())

      expect(exports).toHaveLength(EXPORTS_CAP)
      expect(exports[0].key).toBe(KEY)
      expect(exports[exports.length - 1].id).toBe(`old-${EXPORTS_CAP - 2}`)
      expect(exports.some((e) => e.id === `old-${EXPORTS_CAP - 1}`)).toBe(false)
    })
  })
})
