import {
  FREE_EXPORT_LIMIT,
  FREE_EXPORT_WINDOW_DAYS,
  FREE_EXPORT_WINDOW_MS,
  formatNextFreeExport,
  freeExportAllowance,
  isFreeExportRow,
  newFreeExportRow,
} from './freeExports'


/* eslint-disable no-magic-numbers */
const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days) => new Date(NOW - (days * DAY_MS)).toISOString()
const free = (exportedAt) => ({id: exportedAt, format: 'glb', exportedAt, free: true})
const pro = (exportedAt) => ({id: exportedAt, format: 'glb', exportedAt})


describe('export/freeExports', () => {
  it('is the owner\'s allowance: 2 per rolling 7 days', () => {
    expect(FREE_EXPORT_LIMIT).toBe(2)
    expect(FREE_EXPORT_WINDOW_DAYS).toBe(7)
    expect(FREE_EXPORT_WINDOW_MS).toBe(7 * DAY_MS)
  })

  it('gives a user with no ledger the whole allowance', () => {
    expect(freeExportAllowance(undefined, NOW)).toEqual({limit: 2, used: 0, remaining: 2, nextFreeAt: null})
    expect(freeExportAllowance([], NOW)).toEqual({limit: 2, used: 0, remaining: 2, nextFreeAt: null})
  })

  it('counts free exports inside the window, and says when the oldest frees up', () => {
    const allowance = freeExportAllowance([free(daysAgo(1)), free(daysAgo(3))], NOW)
    expect(allowance).toEqual({
      limit: 2,
      used: 2,
      remaining: 0,
      // The OLDER one (3 days ago) leaves the window first, 4 days from now.
      nextFreeAt: new Date(NOW + (4 * DAY_MS)).toISOString(),
    })
  })

  it('stops counting a row exactly one window after it was made', () => {
    const edge = new Date(NOW - FREE_EXPORT_WINDOW_MS).toISOString()
    const justInside = new Date(NOW - FREE_EXPORT_WINDOW_MS + 1).toISOString()
    expect(freeExportAllowance([free(edge)], NOW).used).toBe(0)
    expect(freeExportAllowance([free(justInside)], NOW).used).toBe(1)
  })

  it('ignores Pro history, so a lapsed subscriber starts with the full allowance', () => {
    const allowance = freeExportAllowance([pro(daysAgo(0)), pro(daysAgo(1)), pro(daysAgo(2))], NOW)
    expect(allowance.used).toBe(0)
    expect(allowance.remaining).toBe(2)
  })

  it('never reports a negative remainder, even past the limit', () => {
    const allowance = freeExportAllowance([free(daysAgo(0)), free(daysAgo(1)), free(daysAgo(2))], NOW)
    expect(allowance.used).toBe(3)
    expect(allowance.remaining).toBe(0)
  })

  it('skips rows whose free flag is not exactly true, or whose stamp is unreadable', () => {
    expect(isFreeExportRow({free: 'yes', exportedAt: daysAgo(0)})).toBe(false)
    expect(isFreeExportRow({free: true, exportedAt: 'not a date'})).toBe(false)
    expect(isFreeExportRow(null)).toBe(false)
    expect(isFreeExportRow(free(daysAgo(0)))).toBe(true)
  })

  it('builds the charge row pro-module writes, with the export details still to come', () => {
    expect(newFreeExportRow({id: 'abc', format: 'glb', now: NOW})).toEqual({
      id: 'abc',
      key: null,
      title: null,
      format: 'glb',
      bytes: null,
      exportedAt: new Date(NOW).toISOString(),
      free: true,
    })
  })

  it('counts the row it builds', () => {
    const row = newFreeExportRow({id: 'abc', format: 'glb', now: NOW})
    expect(freeExportAllowance([row], NOW).used).toBe(1)
  })

  it('names the day and time the next free export frees up', () => {
    const text = formatNextFreeExport('2026-10-09T09:00:00.000Z', 'en-US')
    // Weekday, month and day, in whatever zone the suite runs in: the 9th
    // UTC is the 8th, 9th or 10th somewhere, so the day is read loosely.
    expect(text).toMatch(/^(Wed|Thu|Fri), Oct (8|9|10), \d{1,2}:\d{2}/)
  })

  it('gives no date rather than "Invalid Date"', () => {
    expect(formatNextFreeExport(null)).toBeNull()
    expect(formatNextFreeExport('nope')).toBeNull()
  })
})
