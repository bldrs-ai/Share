import {PERIOD_DAYS, PERIOD_MS, currentPeriod, isInPeriod, periodStartingAt, usesInCurrentPeriod} from './period'


/* eslint-disable no-magic-numbers -- days and offsets ARE the assertion */
describe('quota/period', () => {
  const DAY = 86400000
  const T0 = Date.parse('2026-11-01T12:00:00.000Z')
  const at = (days) => T0 + (days * DAY)

  // Owner decision 2026-11-25: a per-user 30 days, for every tier.
  it('is 30 days long', () => {
    expect(PERIOD_DAYS).toBe(30)
    expect(PERIOD_MS).toBe(30 * DAY)
    expect(periodStartingAt(T0)).toEqual({start: T0, end: at(30)})
  })

  it('includes its start and excludes its end', () => {
    const period = periodStartingAt(T0)
    expect(isInPeriod(period, T0)).toBe(true)
    expect(isInPeriod(period, at(30) - 1)).toBe(true)
    expect(isInPeriod(period, at(30))).toBe(false)
    expect(isInPeriod(period, T0 - 1)).toBe(false)
    expect(isInPeriod(null, T0)).toBe(false)
  })

  describe('currentPeriod', () => {
    it('has no period before the first use', () => {
      expect(currentPeriod([], T0)).toBeNull()
      expect(currentPeriod(undefined, T0)).toBeNull()
    })

    it('starts at the first use and keeps it, not the latest, as the start (not a sliding window)', () => {
      expect(currentPeriod([at(0), at(10), at(29)], at(29))).toEqual(periodStartingAt(T0))
    })

    it('ends, with nothing running, until the next use starts one', () => {
      expect(currentPeriod([at(0), at(29)], at(31))).toBeNull()
    })

    it('chains: the first use at or after an end starts the next period', () => {
      // at(29) joins the first period; at(30) is exactly its end, so it
      // starts the second, which at(45) joins.
      expect(currentPeriod([at(45), at(0), at(30), at(29)], at(50))).toEqual(periodStartingAt(at(30)))
    })

    it('is per user: two users\' periods are staggered by their own first use', () => {
      expect(currentPeriod([at(0)], at(15)).end).toBe(at(30))
      expect(currentPeriod([at(7)], at(15)).end).toBe(at(37))
    })

    it('skips unreadable timestamps', () => {
      expect(currentPeriod([NaN, at(1), Infinity], at(2))).toEqual(periodStartingAt(at(1)))
    })
  })

  it('usesInCurrentPeriod keeps only the running period\'s rows, the one that started it included', () => {
    const rows = [{t: at(0)}, {t: at(31)}, {t: at(40)}]
    const {period, rows: kept} = usesInCurrentPeriod(rows, at(41), (row) => row.t)
    expect(period).toEqual(periodStartingAt(at(31)))
    expect(kept).toEqual([{t: at(31)}, {t: at(40)}])
    // A writer that keeps only `kept` finds the same period next time.
    expect(usesInCurrentPeriod(kept, at(42), (row) => row.t).period).toEqual(period)
  })
})
