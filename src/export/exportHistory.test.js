import {
  hydrateExports,
  loadExports,
  recordExport,
  saveExports,
  subscribeToExports,
  withLocalArtifactFields,
} from './exportHistory'


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

// The shape `record-export.js` validates a client-supplied id against.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i


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
      // The server echoes the id the client minted, so the account's history
      // carries this browser's row under the same id (round-3 fix: key+format
      // no longer pairs an id-bearing local row, only a legacy id-less one).
      const [{id: localId}] = (await loadExports(SUB)).exports

      const {exports} = await hydrateExports(SUB, [{...serverRow, id: localId}])

      expect(exports[0]).toMatchObject({
        id: localId,
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

    it('keeps a pending row the server never took, however the clocks compare', async () => {
      // The row a `record-export` failed on (offline, 5xx). It is stamped by
      // the BROWSER and the claim's rows by the server, so on a machine whose
      // clock trails the server this row reads as older than everything in
      // the claim — and the wall-clock rule that shipped in #1834 dropped it
      // on the next open, defeating the offline fallback it exists to be
      // (#1840). Its state, not its stamp, is what keeps it.
      const pending = {
        id: 'local-pending', key: KEY, title: 'index.ifc', format: 'glb', bytes: 4096,
        exportedAt: '2020-01-01T00:00:00.000Z',
        recorded: false,
        cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER, options: {},
      }
      await saveExports(SUB, [pending, serverRow, otherServerRow])

      const {exports} = await hydrateExports(SUB, [serverRow, otherServerRow])

      expect(exports.map((e) => e.id)).toEqual(['local-pending', 'server-1', 'server-2'])
      // …and it keeps what makes it re-downloadable, and its pending state,
      // since the next merge has to reach the same conclusion.
      expect(exports[0]).toMatchObject({
        recorded: false, cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER,
      })
      expect(JSON.parse(storedFor(SUB)).exports).toHaveLength(3)
    })

    it('still drops a recorded row the server saw and did not keep', async () => {
      // The other direction: a row the server acknowledged (so the mirror
      // holds the server's own copy, with no `recorded` flag on it) and that
      // the claim no longer lists is one the cap pruned. Resurrecting it
      // every time the tab opens is the bug this fix must not introduce —
      // and it stays dropped whether its stamp reads older or newer than the
      // claim's, which is the whole point of #1840.
      const pruned = {
        id: 'local-pruned', key: KEY, title: 'index.ifc', format: 'glb', bytes: 4096,
        exportedAt: '2025-06-01T00:00:00.000Z',
        cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER, options: {},
      }
      const prunedButNewer = {...pruned, id: 'local-pruned-newer', exportedAt: '2026-06-01T00:00:00.000Z'}
      await saveExports(SUB, [prunedButNewer, serverRow, pruned, otherServerRow])

      const {exports} = await hydrateExports(SUB, [serverRow, otherServerRow])

      expect(exports.map((e) => e.id)).toEqual(['server-1', 'server-2'])
    })
  })

  describe('withLocalArtifactFields', () => {
    // Two different sizes, so a row that picked up the wrong twin's fields
    // is visible in the assertion.
    const NEWER_BYTES = 2048
    const OLDER_BYTES = 4096

    /**
     * @param {string} id Row id, shared with the server row it belongs to
     * @param {object} options The options that export ran with
     * @return {object} a local mirror row for KEY as a GLB
     */
    function aLocalRow(id, options) {
      return {
        id,
        key: KEY,
        title: 'index.ifc',
        format: 'glb',
        bytes: 2048,
        exportedAt: '2026-01-02T00:00:00.000Z',
        cacheKeyArgs: {...CACHE_KEY_ARGS, sourceHash: `sha-${id}`},
        schemaVer: SCHEMA_VER,
        options,
      }
    }

    it('gives each server row the fields of the local row it IS, not of the newest one', () => {
      // The same model exported twice, with the metadata toggle flipped in
      // between. Matching on key + format alone hands BOTH server rows the
      // newer local row's options and cache key, so "Download again" on the
      // older row produces a file that is not the one its size describes
      // (#1834).
      const newer = aLocalRow('id-newer', {stripBldrsMetadata: true})
      const older = aLocalRow('id-older', {stripBldrsMetadata: false})
      const serverRows = [
        {id: 'id-newer', key: KEY, title: 'index.ifc', format: 'glb', bytes: NEWER_BYTES,
          exportedAt: '2026-01-02T00:00:01.000Z'},
        {id: 'id-older', key: KEY, title: 'index.ifc', format: 'glb', bytes: OLDER_BYTES,
          exportedAt: '2026-01-01T00:00:01.000Z'},
      ]

      const merged = withLocalArtifactFields(serverRows, [newer, older])

      expect(merged[0].options).toEqual({stripBldrsMetadata: true})
      expect(merged[0].cacheKeyArgs.sourceHash).toBe('sha-id-newer')
      expect(merged[1].options).toEqual({stripBldrsMetadata: false})
      expect(merged[1].cacheKeyArgs.sourceHash).toBe('sha-id-older')
      // The server's own fields are authoritative and untouched.
      expect(merged[1].bytes).toBe(OLDER_BYTES)
    })

    it('falls back to key and format for legacy rows, and consumes each once', () => {
      // Rows recorded before the client sent an id: the server minted its
      // own, so nothing matches by id. Pairing is then positional within the
      // key+format group — newest server row with newest local row — rather
      // than the same local row being reused for both.
      const newer = {...aLocalRow('local-newer', {stripBldrsMetadata: true}), id: undefined}
      const older = {...aLocalRow('local-older', {stripBldrsMetadata: false}), id: undefined}
      const serverRows = [
        {id: 'srv-1', key: KEY, title: null, format: 'glb', bytes: NEWER_BYTES,
          exportedAt: '2026-01-02T00:00:01.000Z'},
        {id: 'srv-2', key: KEY, title: null, format: 'glb', bytes: OLDER_BYTES,
          exportedAt: '2026-01-01T00:00:01.000Z'},
      ]

      const merged = withLocalArtifactFields(serverRows, [newer, older])

      expect(merged[0].options).toEqual({stripBldrsMetadata: true})
      expect(merged[1].options).toEqual({stripBldrsMetadata: false})
    })

    it('never pairs an id-bearing local row the server lacks with a later export of the same model', () => {
      // The local row's server write failed (or the cap pruned it), and the
      // user then exported the same model again from another browser. The
      // id pass finds nothing for either side; the key fallback must NOT
      // step in, or the new export inherits the old row's cacheKeyArgs and
      // options — a wrong revision, or metadata that file never carried.
      const orphan = aLocalRow('local-orphan', {stripBldrsMetadata: true})
      const later = {
        id: 'srv-later', key: KEY, title: null, format: 'glb', bytes: NEWER_BYTES,
        exportedAt: '2026-02-01T00:00:00.000Z',
      }

      const merged = withLocalArtifactFields([later], [orphan])

      expect(merged[0]).toEqual(later)
    })

    it('invents no artifact fields for a server row this browser never wrote', () => {
      const local = aLocalRow('id-1', {stripBldrsMetadata: true})
      const elsewhere = {
        id: 'id-elsewhere', key: '/share/v/p/other.ifc', title: null,
        format: 'glb', bytes: 1, exportedAt: '2025-01-01T00:00:00.000Z',
      }

      const merged = withLocalArtifactFields([elsewhere], [local])

      expect(merged[0]).toEqual(elsewhere)
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

      // The optimistic write is the first notification, and its row is the
      // one whose id has to travel.
      let optimisticId = null
      const unsubscribe = subscribeToExports(SUB, ({exports}) => {
        optimisticId = optimisticId ?? exports[0].id
      })

      await recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'))
      unsubscribe()

      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      // The id DOES go up — it is what the server echoes so the merge can
      // pair the two rows one-to-one — and it is the id already on the
      // optimistic local row, not a second one minted for the wire.
      expect(body).toEqual({id: optimisticId, key: KEY, format: 'glb', bytes: 2048, title: 'index.ifc'})
      expect(optimisticId).toMatch(UUID_PATTERN)
    })

    it('mints a row id the server will accept, even with no crypto.randomUUID', async () => {
      // `record-export.js` 400s an id that isn't a well-formed v4 UUID, so
      // the fallback path (jsdom, or a browser on a non-secure origin) has
      // to produce one too — otherwise the whole record is lost, not just
      // the id.
      const realCrypto = global.crypto
      Object.defineProperty(global, 'crypto', {value: {}, configurable: true})
      try {
        const {exports} = await recordExport(anEntry(), SUB)

        expect(exports[0].id).toMatch(UUID_PATTERN)
      } finally {
        Object.defineProperty(global, 'crypto', {value: realCrypto, configurable: true})
      }
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
      // The real function echoes the client-minted id (record-export.js), and
      // that echo is what pairs the server row with this browser's artifact
      // fields — key+format no longer does (round 3).
      let sentId
      global.fetch.mockImplementation((url, init) => {
        sentId = JSON.parse(init.body).id
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({exports: [{...serverRow, id: sentId}, otherDeviceRow]}),
        })
      })
      const refreshToken = jest.fn().mockResolvedValue('fresh')

      const result = await recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'), refreshToken)

      expect(result.recorded).toBe(true)
      expect(sentId).toMatch(/^[0-9a-f-]{36}$/)
      const stored = (await loadExports(SUB)).exports
      expect(stored).toHaveLength(2)
      expect(stored[0]).toMatchObject({
        id: sentId,
        cacheKeyArgs: CACHE_KEY_ARGS,
        schemaVer: SCHEMA_VER,
        options: {stripBldrsMetadata: true},
      })
      // A row this browser never wrote gets no artifact fields invented for it.
      expect(stored[1]).toEqual(otherDeviceRow)
      // The JWT carries app_metadata, so other readers need the new one.
      expect(refreshToken).toHaveBeenCalled()
    })

    it('marks the optimistic row pending, and the server\'s echo clears it', async () => {
      // The flag hydration reads (#1840). It has to be written by the same
      // call that knows the outcome, and it has to be GONE on the mirrored
      // row — a row still marked pending after the server took it would be
      // re-kept above every later merge for as long as it lives.
      let sentId
      global.fetch.mockImplementation((url, init) => {
        sentId = JSON.parse(init.body).id
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({exports: [
            {id: sentId, key: KEY, title: 'index.ifc', format: 'glb', bytes: 2048,
              exportedAt: '2026-01-01T00:00:00.000Z'},
          ]}),
        })
      })
      const seen = []
      const unsubscribe = subscribeToExports(SUB, ({exports}) => seen.push(exports[0]))

      await recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'))
      unsubscribe()

      expect(seen[0].recorded).toBe(false)
      expect((await loadExports(SUB)).exports[0].recorded).toBeUndefined()
    })

    it('carries an earlier pending row through the next successful record', async () => {
      // The mirror replaces the local list with the server's, so without the
      // pending pass the first export that DOES reach the server silently
      // takes the offline one with it — the same loss #1840 reports at
      // hydration, one layer down.
      global.fetch.mockRejectedValueOnce(new Error('offline'))
      const {exports: afterFailure} = await recordExport(
        anEntry({title: 'offline.ifc'}), SUB, jest.fn().mockResolvedValue('token'))
      const pendingId = afterFailure[0].id

      global.fetch.mockImplementation((url, init) => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({exports: [
          {id: JSON.parse(init.body).id, key: KEY, title: 'index.ifc', format: 'glb',
            bytes: 2048, exportedAt: '2026-01-01T00:00:00.000Z'},
        ]}),
      }))
      const {exports} = await recordExport(anEntry(), SUB, jest.fn().mockResolvedValue('token'))

      expect(exports.map((e) => e.id)).toContain(pendingId)
      expect(exports.find((e) => e.id === pendingId)).toMatchObject({recorded: false, title: 'offline.ifc'})
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
