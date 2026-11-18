/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/*
 * The hosted assistant's ledger (`_lib/aiLedger.js`): reserve, then settle,
 * under compare-and-swap on Netlify Blobs.
 *
 * The race tests are the point of this file. They drive the REAL
 * @netlify/blobs client against a server that implements the Blobs API's
 * conditional-write contract (`fakeBlobs.js`), with enough latency that two
 * concurrent reservations both read the balance before either writes. Only
 * one can land; the other's conditional PUT is refused with a 412 and its
 * retry sees the first hold. Remove the condition from the write and the
 * second test goes red (both reservations succeed): that is the
 * check-then-debit bug the design doc's §7 "Reserve, then settle" exists to
 * prevent.
 */
import {
  CAS_ATTEMPTS,
  HOLD_TTL_MS,
  LedgerUnavailableError,
  releaseAll,
  reserve,
  reserveAll,
  settle,
  settleAll,
  utcDay,
} from '../_lib/aiLedger.js'
import {createFakeBlobs, storedRecord} from './fakeBlobs.js'


/* eslint-disable no-magic-numbers */
const NOW = Date.parse('2026-11-18T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const TODAY = utcDay(NOW)


/**
 * @param {object} [overrides]
 * @return {object} a bucket
 */
function bucket(overrides = {}) {
  return {name: 'identity', key: 'ai/anonymous/a1', limit: 100, windowDays: 1, freeRequestsPerDay: 3,
    concurrency: 5, ...overrides}
}


describe('aiLedger', () => {
  it('two concurrent reservations against one balance cannot both succeed', async () => {
    const fake = createFakeBlobs({delayMs: 10})
    const b = bucket({limit: 100})
    const results = await Promise.all([
      reserve(fake.store, b, {id: 'r1', micro: 60, free: false, nowMs: NOW}),
      reserve(fake.store, b, {id: 'r2', micro: 60, free: false, nowMs: NOW}),
    ])
    expect(results.map((r) => r.ok).sort()).toEqual([false, true])
    expect(results.find((r) => !r.ok)).toMatchObject({reason: 'budget', used: 60, limit: 100})
    // Both read the empty record, both tried to create it, and the loser was
    // refused by the server: the CAS path really ran.
    const puts = fake.requests.filter((r) => r.method === 'PUT')
    expect(puts.filter((r) => r.status === 412)).toHaveLength(1)
    expect(puts.every((r) => r.ifNoneMatch === '*' || r.ifMatch)).toBe(true)
    expect(Object.keys(storedRecord(fake, b.key).holds)).toHaveLength(1)
  })

  it('a burst of ten parallel reservations reserves no more than the budget', async () => {
    const fake = createFakeBlobs({delayMs: 3})
    const b = bucket({limit: 250, concurrency: 100})
    const results = await Promise.all(Array.from({length: 10}, (_, i) =>
      reserve(fake.store, b, {id: `r${i}`, micro: 100, free: false, nowMs: NOW}).catch((e) => e)))
    // Some may give up on contention (a hot key); none may overspend.
    const ok = results.filter((r) => r.ok === true)
    expect(ok).toHaveLength(2)
    const record = storedRecord(fake, b.key)
    expect(Object.values(record.holds).reduce((sum, h) => sum + h.micro, 0)).toBeLessThanOrEqual(250)
  })

  it('writes with If-Match on an existing record (never an unconditional PUT)', async () => {
    const fake = createFakeBlobs()
    const b = bucket()
    await reserve(fake.store, b, {id: 'r1', micro: 10, free: false, nowMs: NOW})
    await reserve(fake.store, b, {id: 'r2', micro: 10, free: false, nowMs: NOW})
    const puts = fake.requests.filter((r) => r.method === 'PUT')
    expect(puts.map((r) => [r.ifNoneMatch, r.ifMatch])).toEqual([['*', null], [null, '"v1"']])
  })

  // The trap the ledger avoids (aiLedger.js header): in @netlify/blobs
  // 10.7.4, setJSON drops `onlyIfMatch` on the floor, so its write is
  // unconditional and still reports `modified: true`. If this starts failing
  // after an upgrade, setJSON has been fixed; the ledger can stay on set().
  it('documents that setJSON in the pinned @netlify/blobs sends no condition', async () => {
    const fake = createFakeBlobs()
    await fake.store.set('k', '1')
    const result = await fake.store.setJSON('k', 2, {onlyIfMatch: '"stale"'})
    const last = fake.requests[fake.requests.length - 1]
    expect(last.ifMatch).toBeNull()
    expect(result.modified).toBe(true)
  })

  it('refuses at the budget, counting live holds as spent', async () => {
    const fake = createFakeBlobs()
    const b = bucket({limit: 100})
    expect((await reserve(fake.store, b, {id: 'r1', micro: 70, free: false, nowMs: NOW})).ok).toBe(true)
    const refused = await reserve(fake.store, b, {id: 'r2', micro: 31, free: false, nowMs: NOW})
    expect(refused).toMatchObject({ok: false, reason: 'budget', used: 70})
    expect((await reserve(fake.store, b, {id: 'r3', micro: 30, free: false, nowMs: NOW})).ok).toBe(true)
  })

  it('settles a hold to the actual cost and frees the difference', async () => {
    const fake = createFakeBlobs()
    const b = bucket({limit: 100})
    await reserve(fake.store, b, {id: 'r1', micro: 90, free: false, nowMs: NOW})
    await settle(fake.store, b, {id: 'r1', micro: 12, nowMs: NOW})
    expect(storedRecord(fake, b.key)).toEqual({v: 1, days: {[TODAY]: {spent: 12, free: 0}}, holds: {}, estimates: {}})
    expect((await reserve(fake.store, b, {id: 'r2', micro: 88, free: false, nowMs: NOW})).ok).toBe(true)
  })

  it('an estimated settle books the amount and keeps it, with its generation, for reconciliation', async () => {
    const fake = createFakeBlobs()
    const b = bucket({limit: 100, windowDays: 30})
    await reserve(fake.store, b, {id: 'r1', micro: 90, free: false, nowMs: NOW})
    await settle(fake.store, b, {id: 'r1', micro: 90, nowMs: NOW, estimate: {generation: 'gen-9'}})
    expect(storedRecord(fake, b.key)).toEqual({v: 1, days: {[TODAY]: {spent: 90, free: 0}}, holds: {},
      estimates: {r1: {micro: 90, day: TODAY, generation: 'gen-9'}}})
    // Estimates leave with their day.
    await reserve(fake.store, b, {id: 'r2', micro: 1, free: false, nowMs: NOW + (30 * DAY_MS)})
    expect(storedRecord(fake, b.key).estimates).toEqual({})
  })

  it('a settle above the hold books the whole actual cost: never clamped to the reservation', async () => {
    const fake = createFakeBlobs()
    const b = bucket({limit: 100})
    await reserve(fake.store, b, {id: 'r1', micro: 10, free: false, nowMs: NOW})
    await settle(fake.store, b, {id: 'r1', micro: 250, nowMs: NOW})
    expect(storedRecord(fake, b.key).days[TODAY].spent).toBe(250)
  })

  it('a release gives the whole hold back and books nothing', async () => {
    const fake = createFakeBlobs()
    const b = bucket()
    await reserve(fake.store, b, {id: 'r1', micro: 90, free: true, nowMs: NOW})
    await settle(fake.store, b, {id: 'r1', micro: 0, nowMs: NOW, release: true})
    expect(storedRecord(fake, b.key)).toEqual({v: 1, days: {}, holds: {}, estimates: {}})
  })

  it('caps in-flight holds per identity', async () => {
    const fake = createFakeBlobs()
    const b = bucket({concurrency: 2})
    await reserve(fake.store, b, {id: 'r1', micro: 1, free: false, nowMs: NOW})
    await reserve(fake.store, b, {id: 'r2', micro: 1, free: false, nowMs: NOW})
    expect(await reserve(fake.store, b, {id: 'r3', micro: 1, free: false, nowMs: NOW}))
      .toMatchObject({ok: false, reason: 'concurrency'})
    await settle(fake.store, b, {id: 'r1', micro: 1, nowMs: NOW})
    expect((await reserve(fake.store, b, {id: 'r3', micro: 1, free: false, nowMs: NOW})).ok).toBe(true)
  })

  it('counts free-model requests per day, settled and in flight, against their own cap', async () => {
    const fake = createFakeBlobs()
    const b = bucket({freeRequestsPerDay: 2})
    await reserve(fake.store, b, {id: 'f1', micro: 0, free: true, nowMs: NOW})
    await settle(fake.store, b, {id: 'f1', micro: 0, nowMs: NOW})
    await reserve(fake.store, b, {id: 'f2', micro: 0, free: true, nowMs: NOW})
    expect(await reserve(fake.store, b, {id: 'f3', micro: 0, free: true, nowMs: NOW}))
      .toMatchObject({ok: false, reason: 'free_requests'})
    // Paid requests aren't counted against it.
    expect((await reserve(fake.store, b, {id: 'p1', micro: 1, free: false, nowMs: NOW})).ok).toBe(true)
    // Tomorrow the count starts over (a 30-day bucket keeps the dollars).
    const later = NOW + DAY_MS
    const month = {...b, windowDays: 30}
    expect((await reserve(fake.store, month, {id: 'f4', micro: 0, free: true, nowMs: later})).ok).toBe(true)
  })

  it('turns an expired hold into spend at its reservation, never into a refund', async () => {
    const fake = createFakeBlobs()
    const b = bucket({limit: 100, windowDays: 30})
    await reserve(fake.store, b, {id: 'lost', micro: 80, free: false, nowMs: NOW})
    const later = NOW + HOLD_TTL_MS + 1
    expect(await reserve(fake.store, b, {id: 'r2', micro: 30, free: false, nowMs: later}))
      .toMatchObject({ok: false, reason: 'budget', used: 80})
    // A refusal writes nothing; the next write that lands persists the conversion.
    expect((await reserve(fake.store, b, {id: 'r3', micro: 20, free: false, nowMs: later})).ok).toBe(true)
    expect(storedRecord(fake, b.key).days[TODAY]).toEqual({spent: 80, free: 0})
    expect(Object.keys(storedRecord(fake, b.key).holds)).toEqual(['r3'])
  })

  it('sums the window and forgets days outside it', async () => {
    const fake = createFakeBlobs()
    const b = bucket({limit: 100, windowDays: 30})
    await reserve(fake.store, b, {id: 'old', micro: 90, free: false, nowMs: NOW})
    await settle(fake.store, b, {id: 'old', micro: 90, nowMs: NOW})
    const day29 = NOW + (29 * DAY_MS)
    expect(await reserve(fake.store, b, {id: 'r2', micro: 20, free: false, nowMs: day29}))
      .toMatchObject({ok: false, used: 90})
    const day30 = NOW + (30 * DAY_MS)
    expect(await reserve(fake.store, b, {id: 'r3', micro: 20, free: false, nowMs: day30}))
      .toMatchObject({ok: true, used: 0})
    expect(Object.keys(storedRecord(fake, b.key).days)).toEqual([])
  })

  it('reserveAll is all or nothing: a refusal at the breaker releases the identity hold', async () => {
    const fake = createFakeBlobs()
    const buckets = [bucket(), {name: 'breaker', key: 'ai/breaker/anonymous/2026-11-18', limit: 5, windowDays: 1}]
    const result = await reserveAll(fake.store, buckets, {id: 'r1', micro: 10, free: false, nowMs: NOW})
    expect(result).toMatchObject({ok: false, bucket: 'breaker', reason: 'budget'})
    expect(storedRecord(fake, 'ai/anonymous/a1').holds).toEqual({})
    expect(result.standing.identity).toEqual({used: 0, limit: 100})
  })

  it('settleAll books the actual cost in every bucket', async () => {
    const fake = createFakeBlobs()
    const buckets = [bucket(), bucket({name: 'ip', key: 'ai/ip/h'})]
    await reserveAll(fake.store, buckets, {id: 'r1', micro: 50, free: false, nowMs: NOW})
    expect(await settleAll(fake.store, buckets, {id: 'r1', micro: 7, nowMs: NOW})).toEqual([])
    for (const key of ['ai/anonymous/a1', 'ai/ip/h']) {
      expect(storedRecord(fake, key).days[TODAY].spent).toBe(7)
    }
    await releaseAll(fake.store, buckets, {id: 'nothing-held', nowMs: NOW})
  })

  it('gives up with contention after its retries, and fails closed', async () => {
    const store = {
      getWithMetadata: () => Promise.resolve({data: {v: 1, days: {}, holds: {}}, etag: '"x"'}),
      set: jest.fn(() => Promise.resolve({modified: false})),
    }
    await expect(reserve(store, bucket(), {id: 'r', micro: 1, free: false, nowMs: NOW}))
      .rejects.toMatchObject({name: 'LedgerUnavailableError', reason: 'contention'})
    expect(store.set).toHaveBeenCalledTimes(CAS_ATTEMPTS)
  })

  it('a store error is the store\'s, as a LedgerUnavailableError', async () => {
    const store = {getWithMetadata: () => Promise.reject(new Error('blobs 500')), set: jest.fn()}
    const err = await reserve(store, bucket(), {id: 'r', micro: 1, free: false, nowMs: NOW}).catch((e) => e)
    expect(err).toBeInstanceOf(LedgerUnavailableError)
    expect(err.reason).toBe('store')
  })
})
