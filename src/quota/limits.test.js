import {FREE_EXPORT_LIMIT, FREE_EXPORT_WINDOW_DAYS} from '../export/freeExports'
import {LEGACY_UPLOAD_ROUTE, LOCAL_ONLY_ROUTE} from '../routes/localOnly'
import {
  DRIVE_ROUTE_KIND,
  FREE_PRIVATE_MODEL_LIMIT,
  LIMITS,
  LOCAL_ROUTE_KINDS,
  ROLLING_WINDOW_DAYS,
  TIERS,
  isCountedByRouteKind,
  isMeteredLocalRouteKind,
} from './limits'


/* eslint-disable no-magic-numbers -- the owner's numbers ARE the assertion */
describe('quota/limits', () => {
  // limits.js restates the route names because the functions can't import
  // TypeScript; this is what keeps the copy honest.
  it('names the same local routes as routes/localOnly.ts', () => {
    expect([...LOCAL_ROUTE_KINDS].sort()).toEqual([LOCAL_ONLY_ROUTE, LEGACY_UPLOAD_ROUTE].sort())
  })

  // The owner's tiers (Share#1966 PR): what the pricing page sells.
  it('allows a free account 2 private models per rolling 30 days, and 2 GLB exports per 7', () => {
    expect(FREE_PRIVATE_MODEL_LIMIT).toBe(2)
    expect(LIMITS[TIERS.FREE]).toBe(FREE_PRIVATE_MODEL_LIMIT)
    expect(ROLLING_WINDOW_DAYS).toBe(30)
    expect(FREE_EXPORT_LIMIT).toBe(2)
    expect(FREE_EXPORT_WINDOW_DAYS).toBe(7)
    expect(LIMITS[TIERS.PAID]).toBe(Infinity)
  })

  // Signed-out users are never metered, so there is no tier for them, and no
  // limit left behind for one (Share PR removing the anonymous tier).
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
