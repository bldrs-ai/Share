/* eslint-disable no-magic-numbers */
import {formatClock, formatDuration, formatFullTime} from './taskTimes'


// 2026-11-19 18:01:05 UTC, which is 10:01:05 in Los Angeles (PST, UTC-8).
const WHEN = Date.UTC(2026, 10, 19, 18, 1, 5)
const LA = {locale: 'en-US', timeZone: 'America/Los_Angeles'}

// Newer ICU puts a narrow no-break space before AM/PM; compare as plain spaces.
const plain = (text) => text.replace(/\s/g, ' ')


describe('formatClock', () => {
  it('is the time of day without seconds, in the given zone', () => {
    expect(plain(formatClock(WHEN, LA))).toBe('10:01 AM')
    expect(plain(formatClock(WHEN, {...LA, timeZone: 'UTC'}))).toBe('6:01 PM')
  })
})


describe('formatFullTime', () => {
  it('adds the date, the seconds and the zone\'s short name', () => {
    expect(plain(formatFullTime(WHEN, LA))).toBe('Nov 19, 2026, 10:01:05 AM PST')
  })

  it('names the zone it was asked for, not the machine\'s', () => {
    expect(plain(formatFullTime(WHEN, {...LA, timeZone: 'UTC'}))).toBe('Nov 19, 2026, 6:01:05 PM UTC')
  })
})


describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [400, '0s'],
    [600, '1s'],
    [4000, '4s'],
    [59000, '59s'],
    [60000, '1m'],
    [70000, '1m 10s'],
    [83000, '1m 23s'],
    [120000, '2m'],
    [3600000, '1h'],
    [3900000, '1h 5m'],
    [3905000, '1h 5m 5s'],
    [-5000, '0s'],
  ])('%i ms reads %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})
