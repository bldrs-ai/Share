import {
  FREE_EXPORT_WINDOW_MS,
  expectedNextFreeAt,
  freeLimitHelpText,
  newFreeRows,
  parseFreeExportsHeader,
  parseFreeRemainingCaption,
} from './freeAllowance'


/* eslint-disable no-magic-numbers */
const DAY_MS = 24 * 3600 * 1000


describe('live/freeAllowance', () => {
  describe('parseFreeRemainingCaption', () => {
    it('reads the count line above the limit', () => {
      expect(parseFreeRemainingCaption('2 of 2 free exports left this week'))
        .toEqual({remaining: 2, limit: 2, next: null})
      expect(parseFreeRemainingCaption(' 1 of 2 free exports left this week '))
        .toEqual({remaining: 1, limit: 2, next: null})
    })

    it('reads the date off the line at the limit, verbatim', () => {
      expect(parseFreeRemainingCaption('0 of 2 free exports left this week · next one Thu, Oct 9, 9:00 AM'))
        .toEqual({remaining: 0, limit: 2, next: 'Thu, Oct 9, 9:00 AM'})
    })

    it('does not mistake some other caption for the count', () => {
      expect(parseFreeRemainingCaption(null)).toBeNull()
      expect(parseFreeRemainingCaption('Exporting a GLB needs a Pro subscription')).toBeNull()
      expect(parseFreeRemainingCaption('two of 2 free exports left this week')).toBeNull()
      expect(parseFreeRemainingCaption('0 of 2 free exports left this week · next one ')).toBeNull()
    })
  })

  describe('parseFreeExportsHeader', () => {
    it('reads the allowance pro-module sends after a charge', () => {
      const header = JSON.stringify({limit: 2, used: 1, remaining: 1, nextFreeAt: '2026-10-14T09:00:00.000Z'})
      expect(parseFreeExportsHeader(header))
        .toEqual({limit: 2, used: 1, remaining: 1, nextFreeAt: '2026-10-14T09:00:00.000Z'})
    })

    it('throws on a missing or malformed header instead of reading a zero', () => {
      expect(() => parseFreeExportsHeader(null)).toThrow('X-Bldrs-Free-Exports is missing')
      expect(() => parseFreeExportsHeader('{"limit": 2, "used": 1}')).toThrow('is not an allowance')
      expect(() => parseFreeExportsHeader('{"limit": 2, "used": 1, "remaining": -1}')).toThrow('is not an allowance')
      expect(() => parseFreeExportsHeader('{"limit": 2, "used": 1, "remaining": 1, "nextFreeAt": "soon"}'))
        .toThrow('unreadable nextFreeAt')
      expect(() => parseFreeExportsHeader('not json')).toThrow()
    })
  })

  describe('expectedNextFreeAt', () => {
    const first = '2026-10-07T10:00:00.000Z'
    const second = '2026-10-07T10:05:00.000Z'
    const now = Date.parse(second) + 60_000

    it('is the FIRST of the counted free exports plus seven days, not the latest', () => {
      const rows = [{id: 'b', free: true, exportedAt: second}, {id: 'a', free: true, exportedAt: first}]
      expect(expectedNextFreeAt(rows, now)).toBe('2026-10-14T10:00:00.000Z')
      expect(Date.parse(expectedNextFreeAt(rows, now)) - Date.parse(first)).toBe(FREE_EXPORT_WINDOW_MS)
      expect(FREE_EXPORT_WINDOW_MS).toBe(7 * DAY_MS)
    })

    it('counts only free rows, and only inside the window', () => {
      const old = new Date(Date.parse(first) - (8 * DAY_MS)).toISOString()
      const rows = [
        {id: 'pro', exportedAt: first},
        {id: 'stale', free: true, exportedAt: old},
        {id: 'b', free: true, exportedAt: second},
      ]
      expect(expectedNextFreeAt(rows, now)).toBe('2026-10-14T10:05:00.000Z')
      expect(expectedNextFreeAt([{id: 'pro', exportedAt: first}], now)).toBeNull()
    })
  })

  it('writes the at-limit help the way the gate does', () => {
    expect(freeLimitHelpText('Wed, Oct 14, 10:00 AM')).toBe(
      'You\'ve used your 2 free exports for the last 7 days. Your next free export is available Wed, Oct 14, 10:00 AM.')
  })

  it('finds the free rows a step added, and only those', () => {
    const before = [{id: 'old', free: true}]
    const after = [{id: 'new2', free: true}, {id: 'pro', free: false}, {id: 'new1', free: true}, {id: 'old', free: true}]
    expect(newFreeRows(before, after).map((r) => r.id)).toEqual(['new2', 'new1'])
    expect(newFreeRows(after, after)).toEqual([])
  })
})
