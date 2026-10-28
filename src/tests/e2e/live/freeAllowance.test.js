import {
  HELD_CAPTION,
  PUBLIC_CAPTION,
  SLOT_WINDOW_MS,
  expectedNextFreeSlot,
  fullCaption,
  heldSlots,
  newRows,
  parseSlotsHeader,
  slotsFullHelpText,
  takeCaption,
} from './freeAllowance'


/* eslint-disable no-magic-numbers */
const DAY_MS = 24 * 3600 * 1000


describe('live/freeAllowance', () => {
  it('words the slot line and the gate the way the Export tab does', () => {
    expect(PUBLIC_CAPTION).toBe('Public model: unlimited export')
    expect(HELD_CAPTION).toBe('This model holds one of your 2 free model slots: unlimited export')
    expect(takeCaption(2)).toBe(
      'Exporting takes one of your 2 free model slots (2 left this week), then unlimited export')
    expect(fullCaption('Fri, Oct 31, 9:00 AM'))
      .toBe('Your 2 free model slots this week hold other models · next one frees up Fri, Oct 31, 9:00 AM')
    expect(slotsFullHelpText('Fri, Oct 31, 9:00 AM')).toBe(
      'Your 2 free model slots for the last 7 days hold other models. A model with a slot, or a public one: ' +
      'unlimited export. This one needs a free slot. Your next slot frees up Fri, Oct 31, 9:00 AM.')
  })

  describe('parseSlotsHeader', () => {
    it('reads the slots pro-module sends with a free delivery', () => {
      const header = JSON.stringify({limit: 2, used: 1, remaining: 1, nextFreeAt: '2026-11-03T09:00:00.000Z', taken: true})
      expect(parseSlotsHeader(header))
        .toEqual({limit: 2, used: 1, remaining: 1, nextFreeAt: '2026-11-03T09:00:00.000Z', taken: true})
    })

    it('throws on a missing or malformed header instead of reading a zero', () => {
      expect(() => parseSlotsHeader(null)).toThrow('X-Bldrs-Model-Slots is missing')
      expect(() => parseSlotsHeader('{"limit": 2, "used": 1, "remaining": 1}')).toThrow('is not a slots statement')
      expect(() => parseSlotsHeader('{"limit": 2, "used": 1, "remaining": -1, "taken": false}'))
        .toThrow('is not a slots statement')
      expect(() => parseSlotsHeader('{"limit": 2, "used": 1, "remaining": 1, "taken": true, "nextFreeAt": "soon"}'))
        .toThrow('unreadable nextFreeAt')
      expect(() => parseSlotsHeader('not json')).toThrow()
    })
  })

  describe('expectedNextFreeSlot', () => {
    const first = '2026-10-27T10:00:00.000Z'
    const second = '2026-10-27T10:05:00.000Z'
    const now = Date.parse(second) + 60_000

    it('is the OLDEST held slot plus seven days, not the latest', () => {
      const rows = [{key: '/b', loadedAt: second}, {key: '/a', loadedAt: first}]
      expect(expectedNextFreeSlot(rows, now)).toBe('2026-11-03T10:00:00.000Z')
      expect(Date.parse(expectedNextFreeSlot(rows, now)) - Date.parse(first)).toBe(SLOT_WINDOW_MS)
      expect(SLOT_WINDOW_MS).toBe(7 * DAY_MS)
    })

    it('counts only keyed rows inside the window', () => {
      const old = new Date(Date.parse(first) - (8 * DAY_MS)).toISOString()
      const rows = [{loadedAt: first}, {key: '/stale', loadedAt: old}, {key: '/b', loadedAt: second}]
      expect(heldSlots(rows, now).map((row) => row.key)).toEqual(['/b'])
      expect(expectedNextFreeSlot(rows, now)).toBe('2026-11-03T10:05:00.000Z')
      expect(expectedNextFreeSlot([{key: '/stale', loadedAt: old}], now)).toBeNull()
    })
  })

  it('finds the history rows a step added, and only those', () => {
    const before = [{id: 'old'}]
    const after = [{id: 'new2'}, {id: 'new1'}, {id: 'old'}]
    expect(newRows(before, after).map((r) => r.id)).toEqual(['new2', 'new1'])
    expect(newRows(after, after)).toEqual([])
  })
})
