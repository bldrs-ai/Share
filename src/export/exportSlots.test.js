import {
  EXPORT_SLOT_MISSING_REASON,
  FREE_MODEL_SLOTS,
  MODEL_KEY_MAX_LENGTH,
  NO_FREE_SLOT_REASON,
  decodeModelKeyHeader,
  exportSlotDecision,
  formatNextFreeSlot,
  isModelKey,
  modelSlots,
  slotsHeaderValue,
} from './exportSlots'
import {FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_MS} from '../quota/limits'


/* eslint-disable no-magic-numbers */
const NOW = Date.parse('2026-10-27T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days) => new Date(NOW - (days * DAY_MS)).toISOString()
const slot = (key, loadedAt) => ({key, loadedAt})
const A = '/share/v/gh/o/private/main/a.ifc'
const B = '/share/v/g/drive-file-id'
const LOCAL = '/share/v/local-only/0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc'


describe('export/exportSlots', () => {
  it('has as many slots as the private-model limit: one allowance, not two', () => {
    expect(FREE_MODEL_SLOTS).toBe(FREE_PRIVATE_MODEL_LIMIT)
    expect(FREE_MODEL_SLOTS).toBe(2)
    expect(NO_FREE_SLOT_REASON).toBe('no_free_model_slot')
    expect(EXPORT_SLOT_MISSING_REASON).toBe('export_slot_missing')
  })

  it('gives a user with no ledger every slot', () => {
    expect(modelSlots(undefined, NOW)).toEqual({limit: 2, used: 0, remaining: 2, nextFreeAt: null, keys: []})
    expect(modelSlots([], NOW)).toEqual({limit: 2, used: 0, remaining: 2, nextFreeAt: null, keys: []})
  })

  it('counts the slots inside the window, and says when the oldest frees up', () => {
    expect(modelSlots([slot(A, daysAgo(1)), slot(B, daysAgo(3))], NOW)).toEqual({
      limit: 2,
      used: 2,
      remaining: 0,
      nextFreeAt: new Date(NOW + (4 * DAY_MS)).toISOString(),
      keys: [A, B],
    })
  })

  it('frees a slot exactly one window after it was taken, the edge record-load uses', () => {
    const edge = new Date(NOW - ROLLING_WINDOW_MS).toISOString()
    const justInside = new Date(NOW - ROLLING_WINDOW_MS + 1).toISOString()
    expect(modelSlots([slot(A, edge)], NOW).used).toBe(0)
    expect(modelSlots([slot(A, justInside)], NOW).used).toBe(1)
  })

  it('ignores rows with no string key or an unreadable stamp', () => {
    expect(modelSlots([{key: 7, loadedAt: daysAgo(1)}, {key: A, loadedAt: 'never'}, null], NOW).used).toBe(0)
  })

  describe('exportSlotDecision', () => {
    it('serves a model that already holds a slot, writing nothing — however full the slots are', () => {
      const decision = exportSlotDecision([slot(A, daysAgo(1)), slot(B, daysAgo(2))], A, NOW)
      expect(decision.verdict).toBe('held')
      expect(decision.loads).toBeNull()
      expect(decision.slots).toMatchObject({used: 2, remaining: 0})
    })

    it('has a model that holds no slot take a free one, local files included', () => {
      const decision = exportSlotDecision([slot(A, daysAgo(1))], LOCAL, NOW)
      expect(decision.verdict).toBe('take')
      expect(decision.loads).toEqual([
        slot(A, daysAgo(1)),
        {key: LOCAL, loadedAt: new Date(NOW).toISOString(), via: 'export'},
      ])
      expect(decision.slots).toEqual({
        limit: 2, used: 2, remaining: 0, nextFreeAt: new Date(NOW + (6 * DAY_MS)).toISOString(), keys: [A, LOCAL],
      })
    })

    it('refuses a model that holds no slot when every slot is taken', () => {
      const decision = exportSlotDecision([slot(A, daysAgo(1)), slot(B, daysAgo(2))], LOCAL, NOW)
      expect(decision.verdict).toBe('full')
      expect(decision.loads).toBeNull()
      expect(decision.slots.keys).toEqual([A, B])
    })

    it('drops rolled-off rows from what it writes, as record-load does', () => {
      const decision = exportSlotDecision([slot(A, daysAgo(8)), slot(B, daysAgo(9))], LOCAL, NOW)
      expect(decision.verdict).toBe('take')
      expect(decision.loads.map((row) => row.key)).toEqual([LOCAL])
    })

    it('does not read the retired export ledger: rows shaped like free exports hold no slot', () => {
      // An `app_metadata.exports` row handed in by mistake has no `loadedAt`.
      const oldRows = [{id: 'x', key: A, exportedAt: daysAgo(1), free: true}]
      expect(exportSlotDecision(oldRows, A, NOW).verdict).toBe('take')
    })
  })

  it('shapes a share path as a key, and nothing else', () => {
    expect(isModelKey(A)).toBe(true)
    expect(isModelKey(LOCAL)).toBe(true)
    expect(isModelKey('/Share/share/v/p/index.ifc')).toBe(true)
    expect(isModelKey('/share/v/gh')).toBe(false)
    expect(isModelKey('index.ifc')).toBe(false)
    expect(isModelKey('')).toBe(false)
    expect(isModelKey(null)).toBe(false)
    expect(isModelKey(`/share/v/p/${'x'.repeat(MODEL_KEY_MAX_LENGTH)}`)).toBe(false)
  })

  it('decodes the encoded key header, and gives null for what does not decode', () => {
    expect(decodeModelKeyHeader(encodeURIComponent('/share/v/gh/o/r/main/Gebäude.ifc')))
      .toBe('/share/v/gh/o/r/main/Gebäude.ifc')
    expect(decodeModelKeyHeader('%E0%A4%A')).toBeNull()
    expect(decodeModelKeyHeader('')).toBeNull()
    expect(decodeModelKeyHeader(undefined)).toBeNull()
  })

  it('puts counts in the header, never keys, so the value stays ASCII', () => {
    const value = slotsHeaderValue(modelSlots([slot('/share/v/p/Gebäude.ifc', daysAgo(1))], NOW), true)
    expect(JSON.parse(value)).toEqual({
      limit: 2, used: 1, remaining: 1, nextFreeAt: new Date(NOW + (6 * DAY_MS)).toISOString(), taken: true, public: false,
    })
    expect(JSON.parse(slotsHeaderValue(modelSlots([], NOW), false, true))).toMatchObject({taken: false, public: true})
    expect(value).not.toMatch(/Gebäude/)
  })

  it('names the day and time the next slot frees up', () => {
    const text = formatNextFreeSlot('2026-10-09T09:00:00.000Z', 'en-US')
    expect(text).toMatch(/Oct/)
    expect(text).toMatch(/\d{1,2}:\d{2}/)
  })

  it('gives no date rather than "Invalid Date"', () => {
    expect(formatNextFreeSlot(null)).toBeNull()
    expect(formatNextFreeSlot('garbage')).toBeNull()
  })
})
