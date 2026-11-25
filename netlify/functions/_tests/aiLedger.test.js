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
  SETTLE_ATTEMPTS,
  admits,
  carryAnonymousSpend,
  latestResumeAt,
  recordForReconciliation,
  resumeAtOf,
  releaseAll,
  reserve,
  reserveAll,
  settle,
  settleAll,
  settleWithRetry,
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

  // The soft rule's bound (aiLedger.js "Soft and strict budgets"): each
  // admission is a CAS that sees every hold admitted before it, so the last
  // one admitted saw `spent + held < limit`, and spend ends below `limit +
  // that last hold`. Without the CAS (an unconditional write), every request
  // in the burst reads the same empty record and is admitted: this goes red.
  it('a soft burst of ten parallel reservations stays under the budget plus the last hold admitted', async () => {
    const fake = createFakeBlobs({delayMs: 3})
    const b = bucket({limit: 250, concurrency: 100, soft: true})
    const sizes = [100, 30, 70, 120, 10, 90, 60, 40, 110, 80]
    const results = await Promise.all(sizes.map((micro, i) =>
      reserve(fake.store, b, {id: `r${i}`, micro, free: false, nowMs: NOW}).then((r) => ({...r, micro}),
        (e) => e)))
    const admitted = results.filter((r) => r.ok === true)
    expect(admitted.length).toBeGreaterThan(0)
    // Every admission saw usage under the limit ...
    for (const r of admitted) {
      expect(r.used).toBeLessThan(b.limit)
    }
    // ... so the total is under the limit plus the hold of the last one
    // admitted (the one that saw the most), and never more than budget plus
    // one hold.
    const total = admitted.reduce((sum, r) => sum + r.micro, 0)
    const last = admitted.reduce((a, r) => (r.used > a.used ? r : a))
    expect(last.used + last.micro).toBe(total)
    expect(total).toBeLessThan(b.limit + last.micro)
    expect(total).toBeLessThan(b.limit + Math.max(...sizes))
    // And no admission was lost to a blind write: the record holds them all.
    const record = storedRecord(fake, b.key)
    expect(Object.values(record.holds).reduce((sum, h) => sum + h.micro, 0)).toBe(total)
    // Once over, the bucket refuses whatever the size, and says when it admits again.
    expect(await reserve(fake.store, b, {id: 'next', micro: 1, free: false, nowMs: NOW}))
      .toMatchObject({ok: false, reason: 'budget', resumeAt: Date.parse('2026-11-19T00:00:00.000Z')})
  })

  it('soft: admits a hold larger than what is left while under the limit, then refuses at it', async () => {
    const fake = createFakeBlobs()
    const b = bucket({limit: 100, soft: true})
    expect((await reserve(fake.store, b, {id: 'r1', micro: 70, free: false, nowMs: NOW})).ok).toBe(true)
    // 70 used, 30 left: a strict bucket refuses 31 (the test above); a soft one admits 500.
    expect((await reserve(fake.store, b, {id: 'r2', micro: 500, free: false, nowMs: NOW})).ok).toBe(true)
    await settle(fake.store, b, {id: 'r1', micro: 5, nowMs: NOW})
    await settle(fake.store, b, {id: 'r2', micro: 95, nowMs: NOW})
    // Exactly at the limit is not under it.
    expect(await reserve(fake.store, b, {id: 'r3', micro: 1, free: false, nowMs: NOW}))
      .toMatchObject({ok: false, reason: 'budget', used: 100})
  })

  it('soft: a request with no hold (a free model) is never refused for budget', async () => {
    const fake = createFakeBlobs()
    const b = bucket({limit: 100, soft: true})
    await fake.store.set(b.key, JSON.stringify({v: 1, days: {[TODAY]: {spent: 150, free: 0}}, holds: {}}))
    expect((await reserve(fake.store, b, {id: 'f1', micro: 0, free: true, nowMs: NOW})).ok).toBe(true)
    expect(await reserve(fake.store, b, {id: 'p1', micro: 1, free: false, nowMs: NOW}))
      .toMatchObject({ok: false, reason: 'budget'})
  })

  it('admits: strict needs the hold to fit, soft only usage under the limit', () => {
    const strict = {limit: 100}
    const soft = {limit: 100, soft: true}
    expect([admits(strict, 50, 50), admits(strict, 50, 51), admits(strict, 0, 101)]).toEqual([true, false, false])
    expect([admits(soft, 99, 1000), admits(soft, 100, 1), admits(soft, 100, 0)]).toEqual([true, false, true])
  })

  describe('resumeAtOf', () => {
    const dayAt = (offset) => utcDay(NOW + (offset * DAY_MS))
    const midnight = (offset) => Date.parse(`${dayAt(offset)}T00:00:00.000Z`)

    it('a one-day bucket resumes at the next UTC midnight, holds counted as today\'s', () => {
      const b = bucket({limit: 100, windowDays: 1, soft: true})
      const record = {v: 1, days: {[TODAY]: {spent: 60, free: 0}}, holds: {h: {micro: 40, free: 0, at: NOW}},
        estimates: {}}
      expect(resumeAtOf(record, b, 10, NOW)).toBe(midnight(1))
      expect(new Date(resumeAtOf(record, b, 10, NOW)).toISOString()).toBe('2026-11-19T00:00:00.000Z')
    })

    it('a 30-day bucket resumes when enough of its oldest spend has left the window', () => {
      const b = bucket({limit: 100, windowDays: 30, soft: true})
      const record = {v: 1, days: {
        [dayAt(-29)]: {spent: 10, free: 0},
        [dayAt(-20)]: {spent: 50, free: 0},
        [dayAt(-3)]: {spent: 45, free: 0},
      }, holds: {}, estimates: {}}
      // 105 used. Day -29 leaving tomorrow drops it to 95: under the limit.
      expect(resumeAtOf(record, b, 10, NOW)).toBe(midnight(1))
      // Heavier recent spend: 10 + 50 + 95 = 155; only once day -20 leaves (in 10 days) is it 95.
      record.days[dayAt(-3)].spent = 95
      expect(resumeAtOf(record, b, 10, NOW)).toBe(midnight(10))
      // Today's spend alone past the limit: the whole window has to turn over.
      record.days[TODAY] = {spent: 150, free: 0}
      expect(resumeAtOf(record, b, 10, NOW)).toBe(midnight(30))
    })

    it('strict: resumes when the hold itself fits; never, for a hold larger than the limit', () => {
      const b = bucket({limit: 100, windowDays: 30})
      const record = {v: 1, days: {[dayAt(-29)]: {spent: 40, free: 0}, [dayAt(-1)]: {spent: 40, free: 0}}, holds: {},
        estimates: {}}
      expect(resumeAtOf(record, b, 20, NOW)).toBeNull()
      expect(resumeAtOf(record, b, 30, NOW)).toBe(midnight(1))
      expect(resumeAtOf(record, b, 70, NOW)).toBe(midnight(29))
      expect(resumeAtOf(record, b, 101, NOW)).toBeNull()
    })

    it('rides on the refusal, and latestResumeAt reads only a bucket whose window could end later', async () => {
      const fake = createFakeBlobs()
      const identity = bucket({limit: 100, windowDays: 1, soft: true})
      const ip = bucket({name: 'ip', key: 'ai/ip/h', limit: 100, windowDays: 1, soft: true})
      const monthly = bucket({name: 'org', key: 'ai/org/o', limit: 100, windowDays: 30, soft: true})
      await fake.store.set(identity.key, JSON.stringify({v: 1, days: {[TODAY]: {spent: 100, free: 0}}, holds: {}}))
      await fake.store.set(monthly.key, JSON.stringify({v: 1, days: {[dayAt(-5)]: {spent: 100, free: 0}},
        holds: {}}))
      const refused = await reserveAll(fake.store, [identity, ip, monthly],
        {id: 'r1', micro: 10, free: false, nowMs: NOW})
      expect(refused).toMatchObject({ok: false, bucket: 'identity', reason: 'budget', resumeAt: midnight(1)})
      const reads = () => fake.requests.filter((r) => r.method === 'GET').length
      const before = reads()
      // The IP bucket's one-day window can't end after the identity's: not read.
      expect(await latestResumeAt(fake.store, [ip], {micro: 10, nowMs: NOW, resumeAt: refused.resumeAt}))
        .toBe(midnight(1))
      expect(reads()).toBe(before)
      // A 30-day one can, and does: its spend from five days ago leaves in 25.
      expect(await latestResumeAt(fake.store, [ip, monthly], {micro: 10, nowMs: NOW, resumeAt: refused.resumeAt}))
        .toBe(midnight(25))
      expect(reads()).toBe(before + 1)
    })

    it('a refusal that isn\'t for budget carries no resumeAt', async () => {
      const fake = createFakeBlobs()
      const b = bucket({concurrency: 1, soft: true})
      await reserve(fake.store, b, {id: 'r1', micro: 1, free: false, nowMs: NOW})
      expect(await reserveAll(fake.store, [b], {id: 'r2', micro: 1, free: false, nowMs: NOW}))
        .toMatchObject({ok: false, reason: 'concurrency', resumeAt: null})
    })
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
    const results = await settleAll(fake.store, buckets, {id: 'r1', micro: 7, nowMs: NOW})
    expect(results.map(({bucket: b, ...r}) => [b.name, r])).toEqual([
      ['identity', {ok: true, settled: true, attempts: 1}], ['ip', {ok: true, settled: true, attempts: 1}]])
    for (const key of ['ai/anonymous/a1', 'ai/ip/h']) {
      expect(storedRecord(fake, key).days[TODAY].spent).toBe(7)
    }
    await releaseAll(fake.store, buckets, {id: 'nothing-held', nowMs: NOW})
  })

  // Codex on #2220 (settle failures). A settle that fails is retried; the
  // retry must be safe, because a failed attempt may have landed.
  describe('settle retries', () => {
    /**
     * @param {object} store a fake's
     * @param {Function} shouldFail `(nthPut) => 'throw' | 'land-then-throw' | undefined`
     * @return {object} the store, its set() failing as told
     */
    const failingSets = (store, shouldFail) => {
      let puts = 0
      const set = store.set.bind(store)
      return Object.assign(Object.create(store), {
        getWithMetadata: store.getWithMetadata.bind(store),
        set: async (...args) => {
          const how = shouldFail(++puts)
          if (how === 'throw') {
            throw new Error('blobs 503')
          }
          const result = await set(...args)
          if (how === 'land-then-throw') {
            throw new Error('socket hang up after the write')
          }
          return result
        },
      })
    }

    it('a transient failure is retried, then settles once', async () => {
      const fake = createFakeBlobs()
      const b = bucket({limit: 100})
      await reserve(fake.store, b, {id: 'r1', micro: 90, free: false, nowMs: NOW})
      const store = failingSets(fake.store, (n) => (n === 1 ? 'throw' : undefined))
      expect(await settleWithRetry(store, b, {id: 'r1', micro: 12, nowMs: NOW}))
        .toEqual({ok: true, settled: true, attempts: 2})
      expect(storedRecord(fake, b.key).days[TODAY].spent).toBe(12)
      expect(storedRecord(fake, b.key).holds).toEqual({})
    })

    it('never double-settles: an attempt that landed but answered an error is not booked twice', async () => {
      const fake = createFakeBlobs()
      const b = bucket({limit: 100})
      await reserve(fake.store, b, {id: 'r1', micro: 90, free: false, nowMs: NOW})
      const store = failingSets(fake.store, (n) => (n === 1 ? 'land-then-throw' : undefined))
      // The retry finds the hold gone, so it writes nothing and says so.
      expect(await settleWithRetry(store, b, {id: 'r1', micro: 12, nowMs: NOW}))
        .toEqual({ok: true, settled: false, attempts: 2})
      expect(storedRecord(fake, b.key).days[TODAY].spent).toBe(12)
    })

    it('never settles a hold that has expired into spend: that would book it twice', async () => {
      const fake = createFakeBlobs()
      const b = bucket({limit: 1000, windowDays: 30})
      await reserve(fake.store, b, {id: 'late', micro: 90, free: false, nowMs: NOW})
      // Another request's write, after the TTL, converts it into spend.
      const later = NOW + HOLD_TTL_MS + 1
      await reserve(fake.store, b, {id: 'other', micro: 1, free: false, nowMs: later})
      expect(await settle(fake.store, b, {id: 'late', micro: 12, nowMs: later})).toEqual({write: false, settled: false})
      expect(storedRecord(fake, b.key).days[TODAY].spent).toBe(90)
    })

    it('a persistent failure stops after its attempts and names the reason', async () => {
      const fake = createFakeBlobs()
      const b = bucket()
      await reserve(fake.store, b, {id: 'r1', micro: 90, free: false, nowMs: NOW})
      const store = failingSets(fake.store, () => 'throw')
      expect(await settleWithRetry(store, b, {id: 'r1', micro: 12, nowMs: NOW}))
        .toEqual({ok: false, attempts: SETTLE_ATTEMPTS, reason: 'store'})
      expect(Object.keys(storedRecord(fake, b.key).holds)).toEqual(['r1'])
    })

    it('starts no retry past its deadline', async () => {
      const fake = createFakeBlobs()
      const store = failingSets(fake.store, () => 'throw')
      await reserve(fake.store, bucket(), {id: 'r1', micro: 1, free: false, nowMs: NOW})
      expect(await settleWithRetry(store, bucket(), {id: 'r1', micro: 1, nowMs: NOW}, {deadline: 0}))
        .toMatchObject({ok: false, attempts: 1})
    })

    it('a reconciliation record is created once, under its own key, and a store failure is a false', async () => {
      const fake = createFakeBlobs()
      const entry = {requestId: 'r1', at: NOW, tier: 'anonymous', generation: 'gen-1', actualMicro: 12,
        reservedMicro: 90, buckets: [{name: 'breaker', key: 'ai/breaker/anonymous/x', reason: 'contention'}]}
      expect(await recordForReconciliation(fake.store, entry)).toBe(true)
      expect(await recordForReconciliation(fake.store, {...entry, actualMicro: 99})).toBe(true)
      expect(storedRecord(fake, `ai/reconcile/${TODAY}/r1`)).toEqual({v: 1, ...entry})
      expect(fake.requests.filter((r) => r.method === 'PUT').map((r) => r.ifNoneMatch)).toEqual(['*', '*'])
      const broken = {set: () => Promise.reject(new Error('down'))}
      expect(await recordForReconciliation(broken, entry)).toBe(false)
    })
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

  // Nested caps and per-user periods (owner, 2026-11-25; src/quota/aiCredits.js).
  describe('nested caps over a metering period', () => {
    const PERIOD_DAYS = 30
    const nested = (overrides = {}) => bucket({windowDays: PERIOD_DAYS, limit: 300, soft: true,
      windows: [{days: 1, limit: 10}, {days: 7, limit: 70}, {days: PERIOD_DAYS, limit: 300}], ...overrides})
    const dayOf = (daysAgo) => utcDay(NOW - (daysAgo * DAY_MS))
    const seed = (fake, key, record) => fake.store.set(key, JSON.stringify({v: 1, holds: {}, estimates: {}, ...record}))

    it('refuses at the day cap, resuming tomorrow, with the week and period still open', async () => {
      const fake = createFakeBlobs({delayMs: 1})
      const b = nested({period: {start: NOW - (3 * DAY_MS)}})
      await seed(fake, b.key, {days: {[TODAY]: {spent: 10, free: 0}}})
      const r = await reserve(fake.store, b, {id: 'r1', micro: 1, free: false, nowMs: NOW})
      expect(r).toMatchObject({ok: false, reason: 'budget', used: 10, limit: 10, windowDays: [1]})
      expect(r.resumeAt).toBe(Date.parse(`${utcDay(NOW + DAY_MS)}T00:00:00.000Z`))
    })

    it('refuses at the 7-day cap on an unspent day, until the oldest of the week\'s spend leaves it', async () => {
      const fake = createFakeBlobs({delayMs: 1})
      const b = nested({period: {start: NOW - (10 * DAY_MS)}})
      const days = {}
      for (let i = 1; i <= 7; i++) {
        days[dayOf(i)] = {spent: 10, free: 0}
      }
      await seed(fake, b.key, {days})
      // Six of those seven days are inside today's 7-day window: 60 < 70, so it admits.
      expect((await reserve(fake.store, b, {id: 'r1', micro: 1, free: false, nowMs: NOW})).ok).toBe(true)
      await settle(fake.store, b, {id: 'r1', micro: 10, nowMs: NOW})
      const r = await reserve(fake.store, b, {id: 'r2', micro: 1, free: false, nowMs: NOW})
      expect(r).toMatchObject({ok: false, reason: 'budget', windowDays: [1, 7]})
    })

    it('frees the whole period at its end, not as its days roll off', async () => {
      const fake = createFakeBlobs({delayMs: 1})
      const start = NOW - (20 * DAY_MS)
      const b = nested({windows: [{days: 1, limit: 1000}, {days: 7, limit: 1000}, {days: PERIOD_DAYS, limit: 300}],
        period: {start}})
      await seed(fake, b.key, {days: {[dayOf(19)]: {spent: 300, free: 0}}})
      const r = await reserve(fake.store, b, {id: 'r1', micro: 1, free: false, nowMs: NOW})
      expect(r).toMatchObject({ok: false, windowDays: [PERIOD_DAYS], resumeAt: start + (PERIOD_DAYS * DAY_MS)})
    })

    it('a signed-in identity\'s period starts at its first booked spend, and a release starts none', async () => {
      const fake = createFakeBlobs({delayMs: 1})
      const b = nested({key: 'ai/user/u1', period: 'self'})
      await reserve(fake.store, b, {id: 'r1', micro: 5, free: false, nowMs: NOW})
      await settle(fake.store, b, {id: 'r1', micro: 0, nowMs: NOW, release: true})
      expect(storedRecord(fake, b.key).periodStart).toBeUndefined()
      await reserve(fake.store, b, {id: 'r2', micro: 5, free: false, nowMs: NOW})
      await settle(fake.store, b, {id: 'r2', micro: 4, nowMs: NOW})
      expect(storedRecord(fake, b.key).periodStart).toBe(NOW)
    })

    it('drops an ended period\'s spend: the next period starts empty', async () => {
      const fake = createFakeBlobs({delayMs: 1})
      const b = nested({key: 'ai/user/u2', period: 'self'})
      await seed(fake, b.key, {days: {[dayOf(29)]: {spent: 300, free: 0}}, periodStart: NOW - (31 * DAY_MS)})
      expect(await reserve(fake.store, b, {id: 'r1', micro: 5, free: false, nowMs: NOW})).toMatchObject({ok: true, used: 0})
    })

    it('carries an anonymous token\'s spend into an account once, starting its period if none runs', async () => {
      const fake = createFakeBlobs({delayMs: 1})
      const tokenPeriod = {start: NOW - (2 * DAY_MS)}
      await seed(fake, 'ai/anonymous/a9', {days: {[dayOf(1)]: {spent: 7, free: 0}, [TODAY]: {spent: 3, free: 0}}})
      const carry = {fromKey: 'ai/anonymous/a9', toKey: 'ai/user/u3', carryId: 'c1', tokenPeriod, nowMs: NOW}
      expect(await carryAnonymousSpend(fake.store, carry)).toEqual({carried: true, micro: 10})
      expect(await carryAnonymousSpend(fake.store, carry)).toEqual({carried: false, micro: 0})
      const user = storedRecord(fake, 'ai/user/u3')
      expect(user).toMatchObject({periodStart: tokenPeriod.start, carried: ['c1'],
        days: {[dayOf(1)]: {spent: 7, free: 0}, [TODAY]: {spent: 3, free: 0}}})
      // It counts toward the account's day cap now.
      const b = nested({key: 'ai/user/u3', period: 'self', windows: [{days: 1, limit: 3}, {days: 7, limit: 70},
        {days: PERIOD_DAYS, limit: 300}]})
      expect((await reserve(fake.store, b, {id: 'r1', micro: 1, free: false, nowMs: NOW})).ok).toBe(false)
    })

    // Review on Share#2368: the period's first day must still count on the
    // 31st calendar day, until the period's own end.
    it('still counts the period\'s first day on its last calendar day', async () => {
      const fake = createFakeBlobs({delayMs: 1})
      const dayStart = Date.parse(`${TODAY}T00:00:00.000Z`)
      const start = dayStart - (30 * DAY_MS) + (12 * 60 * 60 * 1000)
      const now = dayStart + (6 * 60 * 60 * 1000)
      const b = nested({windows: [{days: 1, limit: 1000}, {days: 7, limit: 1000}, {days: PERIOD_DAYS, limit: 300}],
        period: {start}})
      await seed(fake, b.key, {days: {[utcDay(start)]: {spent: 300, free: 0}}})
      const r = await reserve(fake.store, b, {id: 'r1', micro: 1, free: false, nowMs: now})
      expect(r).toMatchObject({ok: false, windowDays: [PERIOD_DAYS], resumeAt: start + (PERIOD_DAYS * DAY_MS)})
      // ...and once the period has ended, it is all gone.
      expect((await reserve(fake.store, {...b, period: {start: start + (PERIOD_DAYS * DAY_MS)}},
        {id: 'r2', micro: 1, free: false, nowMs: start + (PERIOD_DAYS * DAY_MS)})).ok).toBe(true)
    })

    it('leaves a bucket with no windows and no period exactly as before', async () => {
      const fake = createFakeBlobs({delayMs: 1})
      const b = bucket({limit: 100})
      await reserve(fake.store, b, {id: 'r1', micro: 10, free: false, nowMs: NOW})
      await settle(fake.store, b, {id: 'r1', micro: 9, nowMs: NOW})
      expect(storedRecord(fake, b.key)).toEqual({v: 1, days: {[TODAY]: {spent: 9, free: 0}}, holds: {}, estimates: {}})
    })
  })
})
