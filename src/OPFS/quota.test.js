import {
  TIERS,
  LIMITS,
  isPrivateKey,
  checkQuota,
  maybeReset,
  loadQuota,
  saveQuota,
  recordLoad,
  subscribeToQuota,
} from './quota'


// ---------------------------------------------------------------------------
// isPrivateKey
// ---------------------------------------------------------------------------
describe('isPrivateKey', () => {
  it('local files are private', () => {
    expect(isPrivateKey('/share/v/new/model.ifc')).toBe(true)
  })

  it('google drive files are private', () => {
    expect(isPrivateKey('/share/v/g/1BxABCxyz')).toBe(true)
  })

  it('public github files are not private', () => {
    expect(isPrivateKey('/share/v/gh/bldrs-ai/test-models/main/ifc/foo.ifc')).toBe(false)
  })

  it('sample paths are not private', () => {
    expect(isPrivateKey('/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc')).toBe(false)
  })
})


// ---------------------------------------------------------------------------
// checkQuota
// ---------------------------------------------------------------------------
describe('checkQuota', () => {
  const makeQuota = (tier, keys = []) => ({
    tier,
    resetDate: '2099-01-01',
    loads: keys.map((key) => ({key, loadedAt: '2026-01-01T00:00:00.000Z'})),
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

  it('marks already-counted key as allowed', () => {
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
})


// ---------------------------------------------------------------------------
// maybeReset
// ---------------------------------------------------------------------------
describe('maybeReset', () => {
  it('resets free tier when today >= resetDate', () => {
    const quota = {tier: TIERS.FREE, resetDate: '2020-01-01', loads: [{key: '/v/g/1', loadedAt: '2020-01-01T00:00:00.000Z'}]}
    const result = maybeReset(quota)
    expect(result.loads).toHaveLength(0)
    expect(result.resetDate).not.toBe('2020-01-01')
  })

  it('does not reset free tier when resetDate is in the future', () => {
    const quota = {tier: TIERS.FREE, resetDate: '2099-12-01', loads: [{key: '/v/g/1', loadedAt: '2099-01-01T00:00:00.000Z'}]}
    const result = maybeReset(quota)
    expect(result.loads).toHaveLength(1)
  })

  it('does not reset anonymous tier (lifetime cap)', () => {
    const quota = {tier: TIERS.ANONYMOUS, resetDate: '2020-01-01', loads: [{key: '/v/new/a.ifc', loadedAt: '2020-01-01T00:00:00.000Z'}]}
    const result = maybeReset(quota)
    expect(result.loads).toHaveLength(1)
  })

  it('does not reset paid tier', () => {
    const quota = {tier: TIERS.PAID, resetDate: '2020-01-01', loads: [{key: '/v/g/1', loadedAt: '2020-01-01T00:00:00.000Z'}]}
    const result = maybeReset(quota)
    expect(result.loads).toHaveLength(1)
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

  it('saveQuota persists and loadQuota reads back', async () => {
    const data = {tier: TIERS.FREE, resetDate: '2099-01-01', loads: [{key: '/v/g/1', loadedAt: '2026-01-01T00:00:00.000Z'}]}
    await saveQuota(data)
    const back = await loadQuota()
    expect(back.tier).toBe(TIERS.FREE)
    expect(back.loads).toHaveLength(1)
  })

  it('subscribeToQuota is called after saveQuota', async () => {
    const cb = jest.fn()
    const unsub = subscribeToQuota(cb)
    const data = {tier: TIERS.ANONYMOUS, resetDate: '2099-01-01', loads: []}
    await saveQuota(data)
    expect(cb).toHaveBeenCalledWith(data)
    unsub()
  })

  it('recordLoad adds a private key', async () => {
    const result = await recordLoad('/share/v/g/abc123')
    expect(result.loads).toHaveLength(1)
    expect(result.loads[0].key).toBe('/share/v/g/abc123')
  })

  it('recordLoad is idempotent for the same key', async () => {
    await recordLoad('/share/v/g/abc123')
    const result = await recordLoad('/share/v/g/abc123')
    expect(result.loads).toHaveLength(1)
  })

  it('recordLoad ignores non-private keys', async () => {
    const result = await recordLoad('/share/v/gh/bldrs-ai/test/main/foo.ifc')
    expect(result).toBeNull()
  })
})
