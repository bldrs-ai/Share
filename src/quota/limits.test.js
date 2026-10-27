import {FREE_EXPORT_LIMIT, FREE_EXPORT_WINDOW_DAYS, FREE_EXPORT_WINDOW_MS} from '../export/freeExports'
import {LEGACY_UPLOAD_ROUTE, LOCAL_ONLY_ROUTE} from '../routes/localOnly'
import {
  DRIVE_ROUTE_KIND,
  FREE_PRIVATE_MODEL_LIMIT,
  LIMITS,
  LOCAL_ROUTE_KINDS,
  ROLLING_WINDOW_DAYS,
  ROLLING_WINDOW_MS,
  TIERS,
  isAlwaysPrivateRouteKind,
} from './limits'


/* eslint-disable no-magic-numbers -- the owner's numbers ARE the assertion */
describe('quota/limits', () => {
  // limits.js restates the route names because the functions can't import
  // TypeScript; this is what keeps the copy honest.
  it('names the same local routes as routes/localOnly.ts', () => {
    expect([...LOCAL_ROUTE_KINDS].sort()).toEqual([LOCAL_ONLY_ROUTE, LEGACY_UPLOAD_ROUTE].sort())
  })

  // The owner's tiers (Share#1966 PR, window 2026-10-26): what the pricing
  // page sells.
  it('allows a free account 2 private models and 2 GLB exports per rolling 7 days', () => {
    expect(FREE_PRIVATE_MODEL_LIMIT).toBe(2)
    expect(LIMITS[TIERS.FREE]).toBe(FREE_PRIVATE_MODEL_LIMIT)
    expect(ROLLING_WINDOW_DAYS).toBe(7)
    expect(ROLLING_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000)
    expect(FREE_EXPORT_LIMIT).toBe(2)
    expect(FREE_EXPORT_WINDOW_DAYS).toBe(7)
    expect(LIMITS[TIERS.PAID]).toBe(Infinity)
  })

  // "Private shares and exports should be on the same timing" (owner,
  // 2026-10-26). FREE_EXPORT_WINDOW_* are aliases of ROLLING_WINDOW_*, so
  // this only guards against someone re-hardcoding a separate export window.
  it('keeps the export window an alias of the private-model window', () => {
    expect(FREE_EXPORT_WINDOW_DAYS).toBe(ROLLING_WINDOW_DAYS)
    expect(FREE_EXPORT_WINDOW_MS).toBe(ROLLING_WINDOW_MS)
  })

  describe('isAlwaysPrivateRouteKind', () => {
    it('counts Drive whatever the local meter says', () => {
      expect(isAlwaysPrivateRouteKind(DRIVE_ROUTE_KIND, false)).toBe(true)
      expect(isAlwaysPrivateRouteKind(DRIVE_ROUTE_KIND, true)).toBe(true)
    })

    it('counts local files only with the local meter on', () => {
      for (const kind of LOCAL_ROUTE_KINDS) {
        expect(isAlwaysPrivateRouteKind(kind, false)).toBe(false)
        expect(isAlwaysPrivateRouteKind(kind, undefined)).toBe(false)
        expect(isAlwaysPrivateRouteKind(kind, true)).toBe(true)
      }
    })

    it('leaves GitHub, hosted and unknown routes to someone else', () => {
      for (const kind of ['gh', 'p', 'u', null, undefined]) {
        expect(isAlwaysPrivateRouteKind(kind, true)).toBe(false)
      }
    })
  })
})
