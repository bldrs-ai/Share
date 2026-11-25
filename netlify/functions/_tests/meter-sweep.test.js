/*
 * Tests for the meter-sweep scheduled function: the anonymous metering
 * ledger's retention (a token's record deleted 30 days after its period
 * ends, leaving an ID-free monthly aggregate; a network's day bucket deleted
 * the day after), over the real @netlify/blobs client and fakeBlobs.js.
 */
import handler, {addToAggregate, emptyAggregate, sweep} from '../meter-sweep.js'
import {anonRecordKey, ipBucketKey, recordUse} from '../_lib/meterLedger.js'
import {PERIOD_MS} from '../../../src/quota/period.js'
import {createFakeBlobs} from './fakeBlobs.js'


/* eslint-disable no-magic-numbers */
const mockStore = {current: null}
jest.mock('@netlify/blobs', () => {
  const actual = jest.requireActual('@netlify/blobs')
  return {...actual, getStore: (options) => (options.fetch ? actual.getStore(options) : mockStore.current)}
})

const DAY = 86400000
const NOW = Date.parse('2026-11-25T03:41:00.000Z')


/**
 * @param {object} store
 * @param {string} anonId
 * @param {number} start the period's start
 * @param {Array<string>} digests one counted use each
 */
async function seedToken(store, anonId, start, digests) {
  for (const digest of digests) {
    await recordUse(store, {anonId, period: {start, end: start + PERIOD_MS}, feature: 'remote_load', digest,
      limit: 2, ipBucket: null})
  }
}


describe('meter-sweep', () => {
  let fake

  beforeEach(() => {
    fake = createFakeBlobs({delayMs: 1, name: 'metering'})
    mockStore.current = fake.store
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const keys = () => [...fake.data.keys()].map((path) => path.slice(path.indexOf('meter/')))

  it('deletes a token record 30 days after its period ends, into an ID-free aggregate, and keeps newer ones', async () => {
    const expiredStart = NOW - PERIOD_MS - (32 * DAY)
    const keptStart = NOW - PERIOD_MS - (20 * DAY)
    await seedToken(fake.store, 'A'.repeat(22), expiredStart, ['d1', 'd2', 'd3'])
    await seedToken(fake.store, 'B'.repeat(22), keptStart, ['d1'])

    const result = await sweep(fake.store, NOW)

    expect(result.deleted.tokens).toBe(1)
    expect(keys()).not.toContain(anonRecordKey('A'.repeat(22), {start: expiredStart}))
    expect(keys()).toContain(anonRecordKey('B'.repeat(22), {start: keptStart}))
    const month = new Date(expiredStart).toISOString().slice(0, 7)
    const aggregate = JSON.parse([...fake.data.entries()].find(([path]) => path.endsWith(`meter/aggregate/${month}`))[1].body)
    expect(aggregate).toEqual({v: 1, tokens: 1, merged: 0,
      features: {remote_load: {counted: 2, last_free: 1, gated: 1, gatedByIp: 0}}})
    expect(JSON.stringify(aggregate)).not.toContain('AAAA')
  })

  it('aggregates a record only once it is deleted, so a failed delete is not counted twice', async () => {
    const expiredStart = NOW - PERIOD_MS - (32 * DAY)
    await seedToken(fake.store, 'C'.repeat(22), expiredStart, ['d1'])
    const failing = {...fake.store, list: (o) => fake.store.list(o), get: (k, o) => fake.store.get(k, o),
      getWithMetadata: (k, o) => fake.store.getWithMetadata(k, o), set: (k, v, o) => fake.store.set(k, v, o),
      delete: () => Promise.reject(new Error('blobs down'))}
    const result = await sweep(failing, NOW)
    expect(result).toMatchObject({deleted: {tokens: 0}, aggregated: [], failed: 1})
    expect(keys().filter((k) => k.startsWith('meter/aggregate/'))).toEqual([])
  })

  it('deletes network buckets once their day is over, the day after', async () => {
    for (const day of ['2026-11-22', '2026-11-24', '2026-11-25']) {
      await fake.store.set(ipBucketKey(day, 'h'), JSON.stringify({v: 1, count: 3}))
    }
    const result = await sweep(fake.store, NOW)
    expect(result.deleted.ipBuckets).toBe(1)
    expect(keys().sort()).toEqual(['meter/ip/2026-11-24/h', 'meter/ip/2026-11-25/h'])
  })

  it('adds to a month\'s aggregate across runs', () => {
    const record = {features: {remote_load: {count: 2, stage: 'gated', gatedBy: 'ip'}}, reported: ['gated'],
      mergedAt: 1}
    const twice = addToAggregate(addToAggregate(emptyAggregate(), record), record)
    expect(twice).toEqual({v: 1, tokens: 2, merged: 2,
      features: {remote_load: {counted: 4, last_free: 0, gated: 2, gatedByIp: 2}}})
  })

  it('answers the run as JSON', async () => {
    const res = await handler()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({deleted: {tokens: 0, ipBuckets: 0}, aggregated: [], failed: 0})
  })
})
