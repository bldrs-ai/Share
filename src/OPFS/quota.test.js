import {
  TIERS,
  LIMITS,
  ROLLING_WINDOW_DAYS,
  isLocallyQuotable,
  isServerResolvedPath,
  isQuotablePath,
  getTier,
  pruneLoads,
  checkQuota,
  loadQuota,
  saveQuota,
  recordLoad,
  subscribeToQuota,
} from './quota'


const SECONDS_PER_MIN = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const MILLIS_PER_SEC = 1000
const DAY_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MIN * MILLIS_PER_SEC

const DAYS_OUTSIDE_WINDOW = 40
const DAYS_INSIDE_WINDOW = 29
const DAYS_NEAR_BOUNDARY = 0.01
const DAYS_FAR_PAST = 365
const DAYS_LONG_PAST = 60


/**
 * @param {number} baseMs reference time in millis since epoch
 * @param {number} days how many days before baseMs
 * @return {string} ISO string `days` before baseMs
 */
function isoDaysBefore(baseMs, days) {
  return new Date(baseMs - (days * DAY_MS)).toISOString()
}


// ---------------------------------------------------------------------------
// path classifiers
// ---------------------------------------------------------------------------
describe('isLocallyQuotable', () => {
  it('local files are locally quotable', () => {
    expect(isLocallyQuotable('/share/v/new/model.ifc')).toBe(true)
  })

  it('google drive files are locally quotable', () => {
    expect(isLocallyQuotable('/share/v/g/1BxABCxyz')).toBe(true)
  })

  it('github files are NOT locally quotable (server decides)', () => {
    expect(isLocallyQuotable('/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc')).toBe(false)
  })
})


describe('isServerResolvedPath', () => {
  it('github files require server resolution', () => {
    expect(isServerResolvedPath('/share/v/gh/foo/bar/main/x.ifc')).toBe(true)
  })

  it('local and drive paths do not require server resolution', () => {
    expect(isServerResolvedPath('/share/v/new/x.ifc')).toBe(false)
    expect(isServerResolvedPath('/share/v/g/abc')).toBe(false)
  })
})


describe('isQuotablePath', () => {
  it('returns true for local, drive, and github', () => {
    expect(isQuotablePath('/share/v/new/x.ifc')).toBe(true)
    expect(isQuotablePath('/share/v/g/abc')).toBe(true)
    expect(isQuotablePath('/share/v/gh/foo/bar/main/x.ifc')).toBe(true)
  })

  it('returns false for unknown paths', () => {
    expect(isQuotablePath('/share/v/p/something')).toBe(false)
    expect(isQuotablePath('/some/other/path')).toBe(false)
  })
})


// ---------------------------------------------------------------------------
// getTier
// ---------------------------------------------------------------------------
describe('getTier', () => {
  it('paid when subscriptionStatus is sharePro', () => {
    expect(getTier({subscriptionStatus: 'sharePro'}, true)).toBe(TIERS.PAID)
  })

  it('free when authenticated without sharePro', () => {
    expect(getTier({}, true)).toBe(TIERS.FREE)
    expect(getTier({subscriptionStatus: 'free'}, true)).toBe(TIERS.FREE)
    expect(getTier(null, true)).toBe(TIERS.FREE)
  })

  it('anonymous when not authenticated, regardless of metadata', () => {
    expect(getTier(null, false)).toBe(TIERS.ANONYMOUS)
    expect(getTier({subscriptionStatus: 'sharePro'}, false)).toBe(TIERS.ANONYMOUS)
  })
})


// ---------------------------------------------------------------------------
// pruneLoads
// ---------------------------------------------------------------------------
describe('pruneLoads', () => {
  const NOW = Date.parse('2026-05-01T00:00:00.000Z')
  const dayBack = (n) => isoDaysBefore(NOW, n)

  it('drops free-tier loads older than 30 days', () => {
    const loads = [
      {key: 'a', loadedAt: dayBack(DAYS_OUTSIDE_WINDOW)}, // out
      {key: 'b', loadedAt: dayBack(DAYS_INSIDE_WINDOW)}, // in
      {key: 'c', loadedAt: dayBack(1)}, // in
    ]
    const out = pruneLoads(loads, TIERS.FREE, NOW)
    expect(out.map((l) => l.key)).toEqual(['b', 'c'])
  })

  it('keeps loads exactly at the boundary', () => {
    const loads = [{key: 'edge', loadedAt: dayBack(ROLLING_WINDOW_DAYS - DAYS_NEAR_BOUNDARY)}]
    expect(pruneLoads(loads, TIERS.FREE, NOW)).toHaveLength(1)
  })

  it('does not prune anonymous tier (lifetime cap)', () => {
    const loads = [{key: 'old', loadedAt: dayBack(DAYS_FAR_PAST)}]
    expect(pruneLoads(loads, TIERS.ANONYMOUS, NOW)).toHaveLength(1)
  })

  it('paid tier prunes too (irrelevant for limit but keeps storage bounded)', () => {
    const loads = [
      {key: 'a', loadedAt: dayBack(DAYS_LONG_PAST)},
      {key: 'b', loadedAt: dayBack(5)},
    ]
    expect(pruneLoads(loads, TIERS.PAID, NOW)).toHaveLength(1)
  })
})


// ---------------------------------------------------------------------------
// checkQuota
// ---------------------------------------------------------------------------
describe('checkQuota', () => {
  const recent = (offsetDays = 1) => isoDaysBefore(Date.now(), offsetDays)

  const makeQuota = (tier, keys = []) => ({
    tier,
    loads: keys.map((key) => ({key, loadedAt: recent()})),
  })

  it('allows first load for anonymous', () => {
    const {allowed, used, limit} = checkQuota(makeQuota(TIERS.ANONYMOUS), '/v/new/a.ifc')
    expect(allowed).toBe(true)
    expect(used).toBe(0)
    expect(limit).toBe(LIMITS[TIERS.ANONYMOUS])
  })

  it('blocks when anonymous limit reached', () => {
    const quota = makeQuota(TIERS.ANONYMOUS, ['/v/new/a.ifc', '/v/new/b.ifc'])
    const {allowed} = checkQuota(quota, '/v/new/c.ifc')
    expect(allowed).toBe(false)
  })

  it('marks already-counted key as allowed even past the limit', () => {
    const quota = makeQuota(TIERS.ANONYMOUS, ['/v/new/a.ifc', '/v/new/b.ifc'])
    const {allowed, alreadyCounted} = checkQuota(quota, '/v/new/a.ifc')
    expect(allowed).toBe(true)
    expect(alreadyCounted).toBe(true)
  })

  it('allows up to the free tier limit', () => {
    const keys = ['/v/g/1', '/v/g/2', '/v/g/3']
    const quota = makeQuota(TIERS.FREE, keys)
    expect(checkQuota(quota, '/v/g/4').allowed).toBe(true)
    const full = makeQuota(TIERS.FREE, [...keys, '/v/g/4'])
    expect(checkQuota(full, '/v/g/5').allowed).toBe(false)
  })

  it('always allows paid tier', () => {
    const keys = Array.from({length: 100}, (_, i) => `/v/g/${i}`)
    const quota = makeQuota(TIERS.PAID, keys)
    expect(checkQuota(quota, '/v/g/999').allowed).toBe(true)
  })

  it('does not count loads outside the rolling window', () => {
    const oldLoad = {key: '/v/g/1', loadedAt: isoDaysBefore(Date.now(), DAYS_OUTSIDE_WINDOW)}
    const quota = {tier: TIERS.FREE, loads: [oldLoad, oldLoad, oldLoad, oldLoad]}
    const {allowed, used} = checkQuota(quota, '/v/g/2')
    expect(used).toBe(0)
    expect(allowed).toBe(true)
  })
})


// ---------------------------------------------------------------------------
// loadQuota / saveQuota / recordLoad (with mocked OPFS)
// ---------------------------------------------------------------------------
describe('loadQuota / saveQuota / recordLoad', () => {
  let store = null

  beforeEach(() => {
    store = null
    const mockWritable = {
      write: jest.fn((data) => {
        store = data
        return Promise.resolve()
      }),
      close: jest.fn(() => Promise.resolve()),
    }
    const mockHandle = {
      getFile: jest.fn(() => Promise.resolve({
        text: () => {
          if (store === null) {
            return Promise.reject(new Error('not found'))
          }
          return Promise.resolve(store)
        },
      })),
      createWritable: jest.fn(() => Promise.resolve(mockWritable)),
    }
    Object.defineProperty(global, 'navigator', {
      value: {
        storage: {
          getDirectory: jest.fn(() => Promise.resolve({
            getFileHandle: jest.fn(() => Promise.resolve(mockHandle)),
          })),
        },
      },
      configurable: true,
    })
  })

  it('loadQuota returns default when no file exists', async () => {
    const quota = await loadQuota()
    expect(quota.tier).toBe(TIERS.ANONYMOUS)
    expect(quota.loads).toHaveLength(0)
  })

  it('loadQuota silently drops legacy resetDate field', async () => {
    store = JSON.stringify({
      tier: TIERS.FREE,
      resetDate: '2099-01-01',
      loads: [{key: '/v/g/1', loadedAt: new Date().toISOString()}],
    })
    const quota = await loadQuota()
    expect(quota.tier).toBe(TIERS.FREE)
    expect(quota.loads).toHaveLength(1)
    expect(quota.resetDate).toBeUndefined()
  })

  it('saveQuota persists and loadQuota reads back', async () => {
    const data = {tier: TIERS.FREE, loads: [{key: '/v/g/1', loadedAt: new Date().toISOString()}]}
    await saveQuota(data)
    const back = await loadQuota()
    expect(back.tier).toBe(TIERS.FREE)
    expect(back.loads).toHaveLength(1)
  })

  it('subscribeToQuota is called after saveQuota', async () => {
    const cb = jest.fn()
    const unsub = subscribeToQuota(cb)
    const data = {tier: TIERS.ANONYMOUS, loads: []}
    await saveQuota(data)
    expect(cb).toHaveBeenCalledWith(data)
    unsub()
  })

  it('recordLoad adds a locally-quotable key', async () => {
    const result = await recordLoad('/share/v/g/abc123')
    expect(result.loads).toHaveLength(1)
    expect(result.loads[0].key).toBe('/share/v/g/abc123')
  })

  it('recordLoad is idempotent for the same key', async () => {
    await recordLoad('/share/v/g/abc123')
    const result = await recordLoad('/share/v/g/abc123')
    expect(result.loads).toHaveLength(1)
  })

  it('recordLoad returns null for github paths (server-resolved)', async () => {
    const result = await recordLoad('/share/v/gh/bldrs-ai/test/main/foo.ifc')
    expect(result).toBeNull()
  })

  it('recordLoad returns null for non-quotable paths', async () => {
    const result = await recordLoad('/share/v/p/something')
    expect(result).toBeNull()
  })
})
