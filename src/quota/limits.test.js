import {FREE_MODEL_SLOTS} from '../export/exportSlots'
import {LEGACY_UPLOAD_ROUTE, LOCAL_ONLY_ROUTE} from '../routes/localOnly'
import {
  DRIVE_ROUTE_KIND,
  FREE_PRIVATE_MODEL_LIMIT,
  LIMITS,
  LOCAL_ROUTE_KINDS,
  ANONYMOUS_IP_DAILY_REMOTE_LOADS,
  ANONYMOUS_REMOTE_LOAD_LIMIT,
  ANON_METERED_ROUTE_KINDS,
  SLOT_PERIOD_DAYS,
  TIERS,
  loadsInCurrentPeriod,
  slotPeriod,
  isCountedByRouteKind,
  isMeteredLocalRouteKind,
  usageQuotaWithLoads,
} from './limits'


/* eslint-disable no-magic-numbers -- the owner's numbers ARE the assertion */
describe('quota/limits', () => {
  // limits.js restates the route names because the functions can't import
  // TypeScript; this is what keeps the copy honest.
  it('names the same local routes as routes/localOnly.ts', () => {
    expect([...LOCAL_ROUTE_KINDS].sort()).toEqual([LOCAL_ONLY_ROUTE, LEGACY_UPLOAD_ROUTE].sort())
  })

  // The owner's tiers (Share#1966 PR, export slots 2026-10-27, the per-user
  // 30-day period 2026-11-25): what the pricing page sells.
  it('gives a free account 2 model slots per 30-day period', () => {
    expect(FREE_PRIVATE_MODEL_LIMIT).toBe(2)
    expect(LIMITS[TIERS.FREE]).toBe(FREE_PRIVATE_MODEL_LIMIT)
    expect(SLOT_PERIOD_DAYS).toBe(30)
    expect(LIMITS[TIERS.PAID]).toBe(Infinity)
  })

  it('gives a signed-out visitor 2 remote loads per period, from GitHub, Drive or a URL, 20 a day per network', () => {
    expect(ANONYMOUS_REMOTE_LOAD_LIMIT).toBe(2)
    expect([...ANON_METERED_ROUTE_KINDS].sort()).toEqual(['g', 'gh', 'u'])
    expect(ANONYMOUS_IP_DAILY_REMOTE_LOADS).toBe(20)
  })

  describe('slot periods', () => {
    const DAY = 86400000
    const T0 = Date.parse('2026-11-01T00:00:00.000Z')
    const row = (key, days) => ({key, loadedAt: new Date(T0 + (days * DAY)).toISOString()})

    it('holds every slot of a period until its end, and frees them together', () => {
      const loads = [row('a', 0), row('b', 20)]
      // Day 29: both held (a rolling 7 days would have freed a by now).
      expect(loadsInCurrentPeriod(loads, T0 + (29 * DAY))).toEqual(loads)
      expect(slotPeriod(loads, T0 + (29 * DAY)).period).toEqual({start: T0, end: T0 + (30 * DAY)})
      // Day 30 exactly: the period has ended, and both come back at once.
      expect(loadsInCurrentPeriod(loads, T0 + (30 * DAY))).toEqual([])
    })

    it('starts the next period at the first use after the last one ended', () => {
      const loads = [row('a', 0), row('b', 35)]
      expect(slotPeriod(loads, T0 + (40 * DAY))).toEqual({period: {start: T0 + (35 * DAY), end: T0 + (65 * DAY)},
        rows: [row('b', 35)]})
    })

    it('chains only well-formed rows, as export slots do', () => {
      expect(slotPeriod([{key: 42, loadedAt: row('x', 0).loadedAt}, row('a', 20)], T0 + (21 * DAY)).period)
        .toEqual({start: T0 + (20 * DAY), end: T0 + (50 * DAY)})
    })

    it('ignores rows it cannot read', () => {
      expect(loadsInCurrentPeriod([{key: 'x', loadedAt: 'not a date'}, row('a', 0)], T0)).toEqual([row('a', 0)])
      expect(loadsInCurrentPeriod(null, T0)).toEqual([])
    })
  })

  // "Ultimately controlled by open slots, not export counts" (owner,
  // 2026-10-27): exports use the private-model slots, not a count of their
  // own, so this guards against someone re-adding a separate export number.
  it('has exports use the private-model slots, not a limit of their own', () => {
    expect(FREE_MODEL_SLOTS).toBe(FREE_PRIVATE_MODEL_LIMIT)
  })

  it('writes back the fields beside loads, and replaces only loads', () => {
    const loads = [{key: '/share/v/p/a.ifc', loadedAt: '2026-10-27T00:00:00.000Z'}]
    expect(usageQuotaWithLoads({loads: [], note: 'kept'}, loads)).toEqual({note: 'kept', loads})
    expect(usageQuotaWithLoads(undefined, loads)).toEqual({loads})
    expect(usageQuotaWithLoads(['not', 'an', 'object'], loads)).toEqual({loads})
  })

  // Signed-out users have no private-model tier (their remote loads are
  // metered on the server's anonymous ledger instead), so none is here.
  it('has exactly the free and paid tiers, each with a limit', () => {
    expect(Object.values(TIERS).sort()).toEqual(['free', 'paid'])
    expect(Object.keys(LIMITS).sort()).toEqual(['free', 'paid'])
  })

  describe('isCountedByRouteKind', () => {
    // record-load counts every Drive key it is sent: it can't see Drive
    // sharing, so the client sends only private files (quota.js#isDrivePath).
    it('counts Drive whatever the local meter says', () => {
      expect(isCountedByRouteKind(DRIVE_ROUTE_KIND, false)).toBe(true)
      expect(isCountedByRouteKind(DRIVE_ROUTE_KIND, true)).toBe(true)
    })

    it('counts local files only with the local meter on', () => {
      for (const kind of LOCAL_ROUTE_KINDS) {
        expect(isCountedByRouteKind(kind, false)).toBe(false)
        expect(isCountedByRouteKind(kind, undefined)).toBe(false)
        expect(isCountedByRouteKind(kind, true)).toBe(true)
      }
    })

    it('leaves GitHub, hosted and unknown routes to someone else', () => {
      for (const kind of ['gh', 'p', 'u', null, undefined]) {
        expect(isCountedByRouteKind(kind, true)).toBe(false)
      }
    })
  })

  describe('isMeteredLocalRouteKind', () => {
    it('is local files with the meter on, and never Drive', () => {
      for (const kind of LOCAL_ROUTE_KINDS) {
        expect(isMeteredLocalRouteKind(kind, true)).toBe(true)
        expect(isMeteredLocalRouteKind(kind, false)).toBe(false)
      }
      expect(isMeteredLocalRouteKind(DRIVE_ROUTE_KIND, true)).toBe(false)
    })
  })
})
