import {
  TIERS,
  LIMITS,
  ROLLING_WINDOW_DAYS,
  isLocalFileMeteringEnabled,
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

// The free tier's window is 7 days (owner, 2026-10-26; was 30). Literal
// days rather than ROLLING_WINDOW_DAYS-relative, so a change to the window
// is a failing test here and not just a test that follows it.
const WINDOW_DAYS = 7
const DAYS_OUTSIDE_WINDOW = 8
const DAYS_INSIDE_WINDOW = 6
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
  const LOCAL_KEYS = [
    '/share/v/local-only/model.ifc',
    '/share/v/new/model.ifc',
    '/Share/share/v/local-only/model.ifc',
  ]

  // Share#1966: viewing a local file is free and unmetered, under the
  // route's current name, its legacy one and the GitHub Pages prefix.
  it('never counts local files with the local meter off (the default)', () => {
    for (const key of LOCAL_KEYS) {
      expect(isLocallyQuotable(key)).toBe(false)
      expect(isLocallyQuotable(key, false)).toBe(false)
      expect(isQuotablePath(key)).toBe(false)
    }
  })

  // The abuse switch (design/new/quotas.md §"Metering local files again").
  it('counts local files when meterLocalFiles is on, under either route name and any prefix', () => {
    for (const key of LOCAL_KEYS) {
      expect(isLocallyQuotable(key, true)).toBe(true)
      expect(isQuotablePath(key, true)).toBe(true)
    }
  })

  it('reads the meterLocalFiles flag by default', () => {
    expect(isLocalFileMeteringEnabled()).toBe(false)
    window.history.pushState({}, '', '/share/v/p/index.ifc?feature=meterLocalFiles')
    try {
      expect(isLocalFileMeteringEnabled()).toBe(true)
      expect(isLocallyQuotable('/share/v/local-only/model.ifc')).toBe(true)
    } finally {
      window.history.pushState({}, '', '/')
    }
  })

  it('google drive files are locally quotable, with or without the local meter', () => {
    expect(isLocallyQuotable('/share/v/g/1BxABCxyz')).toBe(true)
    expect(isLocallyQuotable('/share/v/g/1BxABCxyz', true)).toBe(true)
  })

  it('github files are NOT locally quotable (server decides)', () => {
    expect(isLocallyQuotable('/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc')).toBe(false)
    expect(isLocallyQuotable('/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc', true)).toBe(false)
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


// The route kind is the FIRST `/v/` segment (routes/localOnly.ts): a GitHub
// file whose path contains `v/local-only/` or `v/g/` is a GitHub load, for
// the server to resolve, never a local or Drive one (codex review on #1967).
describe('quota path classification by route kind', () => {
  it('treats a GitHub path containing a local-only or Drive segment as GitHub', () => {
    for (const key of [
      '/share/v/gh/org/repo/main/v/local-only/model.ifc',
      '/share/v/gh/org/repo/main/v/new/model.ifc',
      '/share/v/gh/org/repo/main/v/g/model.ifc',
    ]) {
      expect(isLocallyQuotable(key, true)).toBe(false)
      expect(isServerResolvedPath(key)).toBe(true)
    }
  })

  it('is not fooled by a Drive or local key that looks like it holds /v/gh/', () => {
    expect(isServerResolvedPath('/share/v/g/v/gh/x')).toBe(false)
    expect(isLocallyQuotable('/share/v/g/v/gh/x')).toBe(true)
  })
})


describe('isQuotablePath', () => {
  it('returns true for drive and github, and for local only with the local meter on', () => {
    expect(isQuotablePath('/share/v/g/abc')).toBe(true)
    expect(isQuotablePath('/share/v/gh/foo/bar/main/x.ifc')).toBe(true)
    expect(isQuotablePath('/share/v/local-only/x.ifc')).toBe(false)
    expect(isQuotablePath('/share/v/local-only/x.ifc', true)).toBe(true)
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

  // Paid already, waiting on a re-login (stripe-webhook's FREE→PRO write):
  // the owner's §7.2 decision, design/new/glb-export-premium.md. Drives
  // unlimited loads and the export UI alike.
  it('paid when subscriptionStatus is shareProPendingReauth', () => {
    expect(getTier({subscriptionStatus: 'shareProPendingReauth'}, true)).toBe(TIERS.PAID)
  })

  it('free when authenticated without a Pro status', () => {
    expect(getTier({}, true)).toBe(TIERS.FREE)
    expect(getTier({subscriptionStatus: 'free'}, true)).toBe(TIERS.FREE)
    expect(getTier({subscriptionStatus: 'freePendingReauth'}, true)).toBe(TIERS.FREE)
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

  it('drops free-tier loads older than 7 days', () => {
    expect(ROLLING_WINDOW_DAYS).toBe(WINDOW_DAYS)
    const loads = [
      {key: 'a', loadedAt: dayBack(DAYS_OUTSIDE_WINDOW)}, // out: 8 days ago
      {key: 'b', loadedAt: dayBack(DAYS_INSIDE_WINDOW)}, // in: 6 days ago
      {key: 'c', loadedAt: dayBack(1)}, // in
    ]
    const out = pruneLoads(loads, TIERS.FREE, NOW)
    expect(out.map((l) => l.key)).toEqual(['b', 'c'])
  })

  it('keeps loads exactly at the boundary', () => {
    const loads = [{key: 'edge', loadedAt: dayBack(WINDOW_DAYS - DAYS_NEAR_BOUNDARY)}]
    expect(pruneLoads(loads, TIERS.FREE, NOW)).toHaveLength(1)
  })

  // The edge itself, to the millisecond: inclusive at exactly 7 days
  // (`loadedAt >= now - window`), gone one millisecond later.
  it('counts a load exactly 7 days old, and not one a millisecond older', () => {
    const exactly = new Date(NOW - (WINDOW_DAYS * DAY_MS)).toISOString()
    const justOutside = new Date(NOW - (WINDOW_DAYS * DAY_MS) - 1).toISOString()
    const loads = [{key: 'exactly', loadedAt: exactly}, {key: 'outside', loadedAt: justOutside}]
    expect(pruneLoads(loads, TIERS.FREE, NOW).map((l) => l.key)).toEqual(['exactly'])
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
    const {allowed, used, limit} = checkQuota(makeQuota(TIERS.ANONYMOUS), '/v/g/a')
    expect(allowed).toBe(true)
    expect(used).toBe(0)
    expect(limit).toBe(LIMITS[TIERS.ANONYMOUS])
  })

  it('blocks when anonymous limit reached', () => {
    const quota = makeQuota(TIERS.ANONYMOUS, ['/v/g/a', '/v/g/b'])
    const {allowed} = checkQuota(quota, '/v/g/c')
    expect(allowed).toBe(false)
  })

  it('marks already-counted key as allowed even past the limit', () => {
    const quota = makeQuota(TIERS.ANONYMOUS, ['/v/g/a', '/v/g/b'])
    const {allowed, alreadyCounted} = checkQuota(quota, '/v/g/a')
    expect(allowed).toBe(true)
    expect(alreadyCounted).toBe(true)
  })

  it('free tier: two distinct private models in 7 days, the 3rd is denied', () => {
    expect(LIMITS[TIERS.FREE]).toBe(2)
    expect(checkQuota(makeQuota(TIERS.FREE, ['/v/g/1']), '/v/g/2').allowed).toBe(true)
    const full = makeQuota(TIERS.FREE, ['/v/g/1', '/v/g/2'])
    const third = checkQuota(full, '/v/g/3')
    expect(third.allowed).toBe(false)
    expect(third.used).toBe(2)
    // Reopening one of the two stays free.
    expect(checkQuota(full, '/v/g/1').allowed).toBe(true)
  })

  it('free tier: a model opened 8 days ago no longer counts', () => {
    const quota = {tier: TIERS.FREE, loads: [
      {key: '/v/g/1', loadedAt: isoDaysBefore(Date.now(), DAYS_OUTSIDE_WINDOW)},
      {key: '/v/g/2', loadedAt: recent()},
    ]}
    expect(checkQuota(quota, '/v/g/3')).toMatchObject({allowed: true, used: 1})
  })

  it('free tier: a model opened 6 days ago still counts, so the 3rd is denied', () => {
    const quota = {tier: TIERS.FREE, loads: [
      {key: '/v/g/1', loadedAt: isoDaysBefore(Date.now(), DAYS_INSIDE_WINDOW)},
      {key: '/v/g/2', loadedAt: recent()},
    ]}
    expect(checkQuota(quota, '/v/g/3')).toMatchObject({allowed: false, used: 2})
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

  it('recordLoad never records a local file with the local meter off', async () => {
    expect(await recordLoad('/share/v/local-only/abc.ifc')).toBeNull()
    expect(await recordLoad('/share/v/new/abc.ifc')).toBeNull()
    expect((await loadQuota()).loads).toHaveLength(0)
  })

  it('recordLoad records a local file when meterLocalFiles is on', async () => {
    window.history.pushState({}, '', '/share/v/p/index.ifc?feature=meterLocalFiles')
    try {
      const result = await recordLoad('/share/v/local-only/abc.ifc')
      expect(result.loads.map((l) => l.key)).toEqual(['/share/v/local-only/abc.ifc'])
    } finally {
      window.history.pushState({}, '', '/')
    }
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
