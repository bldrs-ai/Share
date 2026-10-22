import Cookies from 'js-cookie'
import {installGatedFakeLocks, uninstallFakeLocks} from './crossTabLock.fixture'
import * as Analytics from './analytics'
import {
  ENGAGEMENT_STORAGE_KEY,
  MAX_STORED_OPENS,
  resetEngagementPageState,
  trackEngagementOnOpen,
} from './engagementTracking'


const DAY = 24 * 60 * 60 * 1000 // eslint-disable-line no-magic-numbers
const HOUR = 60 * 60 * 1000 // eslint-disable-line no-magic-numbers
// Local noon, so +/- a few hours never crosses a local calendar day.
const T0 = new Date(2026, 9, 1, 12, 0, 0).getTime() // eslint-disable-line no-magic-numbers


/** @return {Array<[string, object]>} [name, params] of the gtag events sent */
function sent() {
  // Events only: setIsAllowed also sends gtag('set', 'user_properties', ...).
  return window.gtag.mock.calls
    .filter(([command]) => command === 'event')
    .map(([, name, params]) => [name, params])
}


/** @return {string[]} names only */
function sentNames() {
  return sent().map(([name]) => name)
}


/** @return {object} the persisted state */
function stored() {
  return JSON.parse(localStorage.getItem(ENGAGEMENT_STORAGE_KEY))
}


describe('trackEngagementOnOpen', () => {
  beforeEach(() => {
    localStorage.clear()
    resetEngagementPageState()
    Cookies.remove('isAnalyticsAllowed')
    Analytics.setIsAllowed(true)
    Analytics._resetGaClientIdForTests()
    window.gtag = jest.fn()
  })

  afterEach(() => {
    delete window.gtag
    uninstallFakeLocks()
    Cookies.remove('isAnalyticsAllowed')
    jest.restoreAllMocks()
  })

  describe('reloads of the same model (theme or view-settings re-init)', () => {
    it('are not counted as another open', async () => {
      await trackEngagementOnOpen(T0, 'gh:a')
      await trackEngagementOnOpen(T0 + HOUR, 'gh:a')
      await trackEngagementOnOpen(T0 + (2 * HOUR), 'gh:a')
      expect(sentNames()).toEqual([])
      expect(stored().opens).toEqual([T0])
    })

    it('a different model is a new open, so three models make engaged use', async () => {
      await trackEngagementOnOpen(T0, 'gh:a')
      await trackEngagementOnOpen(T0 + HOUR, 'gh:b')
      await trackEngagementOnOpen(T0 + (2 * HOUR), 'gh:c')
      expect(sentNames()).toEqual(['engaged_use'])
    })

    it('without a key every call counts', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + HOUR)
      expect(stored().opens).toEqual([T0, T0 + HOUR])
    })
  })

  describe('engaged_use', () => {
    it('fires on the third open inside seven days, not before', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + DAY)
      // The next-day open is a return_visit, but not engaged use yet.
      expect(sentNames()).toEqual(['return_visit'])
      await trackEngagementOnOpen(T0 + (2 * DAY))
      expect(sent().filter(([name]) => name === 'engaged_use')).toEqual([[
        'engaged_use', {window_days: 7, opens_in_window: 3, threshold: 3},
      ]])
    })

    it('counts opens on the same day', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + HOUR)
      await trackEngagementOnOpen(T0 + (2 * HOUR))
      expect(sentNames()).toEqual(['engaged_use'])
    })

    it('does not fire when the opens are spread wider than the window', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + (4 * DAY))
      await trackEngagementOnOpen(T0 + (8 * DAY))
      // Opens 2 and 3 are 4 days apart and open 1 has aged out: 2 in window.
      expect(sentNames().filter((n) => n === 'engaged_use')).toEqual([])
    })

    it('is a rolling window: the 7-day edge is exclusive', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + (3 * DAY))
      await trackEngagementOnOpen(T0 + (7 * DAY))
      expect(sentNames()).not.toContain('engaged_use')
    })

    it('fires at most once per 30 days, then again after', async () => {
      for (let i = 0; i < 6; i++) {
        await trackEngagementOnOpen(T0 + (i * HOUR))
      }
      expect(sentNames().filter((n) => n === 'engaged_use')).toHaveLength(1)
      // 29 days on: three more opens in a week, still inside the cooldown.
      const T29 = T0 + (29 * DAY) // eslint-disable-line no-magic-numbers
      for (let i = 0; i < 3; i++) {
        await trackEngagementOnOpen(T29 + (i * HOUR))
      }
      expect(sentNames().filter((n) => n === 'engaged_use')).toHaveLength(1)
      // 31 days after the first fire.
      const T31 = T0 + (31 * DAY) // eslint-disable-line no-magic-numbers
      for (let i = 0; i < 3; i++) {
        await trackEngagementOnOpen(T31 + (i * HOUR))
      }
      expect(sentNames().filter((n) => n === 'engaged_use')).toHaveLength(2)
    })

    it('reports how many opens the window held', async () => {
      for (let i = 0; i < 3; i++) {
        await trackEngagementOnOpen(T0 + (i * HOUR))
      }
      await trackEngagementOnOpen(T0 + (40 * DAY)) // eslint-disable-line no-magic-numbers
      await trackEngagementOnOpen(T0 + (40 * DAY) + HOUR) // eslint-disable-line no-magic-numbers
      await trackEngagementOnOpen(T0 + (40 * DAY) + (2 * HOUR)) // eslint-disable-line no-magic-numbers
      const fires = sent().filter(([name]) => name === 'engaged_use')
      expect(fires.map(([, params]) => params.opens_in_window)).toEqual([3, 3])
    })
  })

  describe('return_visit', () => {
    it('does not fire on a first open or a same-day second open', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + (2 * HOUR))
      expect(sentNames()).toEqual([])
    })

    it('fires on a later day with the gap in whole calendar days', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + (3 * DAY))
      expect(sent()).toEqual([['return_visit', {days_since_last_open: 3}]])
    })

    it('fires for a next-day return even when under 24 hours elapsed', async () => {
      const lateEvening = new Date(2026, 9, 1, 23, 30).getTime() // eslint-disable-line no-magic-numbers
      await trackEngagementOnOpen(lateEvening)
      await trackEngagementOnOpen(lateEvening + HOUR) // 00:30 next day
      expect(sentNames()).toEqual(['return_visit'])
    })

    it('covers the 14 day boundary and not 15', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + (14 * DAY)) // eslint-disable-line no-magic-numbers
      expect(sent()).toEqual([['return_visit', {days_since_last_open: 14}]])
      localStorage.clear()
      window.gtag.mockClear()
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + (15 * DAY)) // eslint-disable-line no-magic-numbers
      expect(sentNames()).toEqual([])
    })

    it('is measured from the previous open, so a streak keeps firing on new days', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + DAY)
      await trackEngagementOnOpen(T0 + (2 * DAY))
      expect(sentNames().filter((n) => n === 'return_visit')).toHaveLength(2)
    })

    it('fires once per return day, however many opens or tabs follow', async () => {
      await trackEngagementOnOpen(T0)
      const returnDay = T0 + (2 * DAY)
      await trackEngagementOnOpen(returnDay)
      // A second tab that read the state before the first wrote it, replayed
      // by restoring the pre-return state but keeping the marker the first
      // tab wrote.
      const afterFirst = stored()
      localStorage.setItem(ENGAGEMENT_STORAGE_KEY, JSON.stringify({
        ...afterFirst, opens: [T0],
      }))
      await trackEngagementOnOpen(returnDay + HOUR)
      expect(sentNames().filter((n) => n === 'return_visit')).toHaveLength(1)
    })

    it('can fire together with engaged_use on the same open', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + HOUR)
      await trackEngagementOnOpen(T0 + (2 * DAY))
      expect(sentNames()).toEqual(['engaged_use', 'return_visit'])
    })
  })

  describe('gating', () => {
    it('sends and stores nothing when analytics consent is withheld', async () => {
      Analytics.setIsAllowed(false)
      for (let i = 0; i < 4; i++) {
        await trackEngagementOnOpen(T0 + (i * DAY))
      }
      expect(sentNames()).toEqual([])
      expect(localStorage.getItem(ENGAGEMENT_STORAGE_KEY)).toBeNull()
    })

    it('counts nothing from before consent was given', async () => {
      Analytics.setIsAllowed(false)
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + HOUR)
      Analytics.setIsAllowed(true)
      await trackEngagementOnOpen(T0 + (2 * HOUR))
      expect(sentNames()).toEqual([])
    })

    it('fails closed when reading storage throws', async () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      for (let i = 0; i < 4; i++) {
        expect(await trackEngagementOnOpen(T0 + (i * HOUR))).toEqual([])
      }
      expect(window.gtag).not.toHaveBeenCalled()
    })

    it('fails closed when writing storage throws: nothing could stop a repeat', async () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      for (let i = 0; i < 4; i++) {
        await trackEngagementOnOpen(T0 + (i * HOUR))
      }
      expect(window.gtag).not.toHaveBeenCalled()
    })

    it('attaches open_cid like the other funnel events', async () => {
      Analytics.setGaClientId('1871520000.1754700000')
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + DAY)
      expect(window.gtag).toHaveBeenCalledWith('event', 'return_visit', {
        days_since_last_open: 1,
        open_cid: 'cid.1871520000.1754700000',
      })
    })
  })

  describe('stored state', () => {
    it('keeps a capped list of the newest opens', async () => {
      for (let i = 0; i < MAX_STORED_OPENS + 5; i++) {
        await trackEngagementOnOpen(T0 + (i * HOUR))
      }
      expect(stored().opens).toHaveLength(MAX_STORED_OPENS)
      expect(stored().opens.at(-1)).toBe(T0 + ((MAX_STORED_OPENS + 4) * HOUR))
    })

    it.each([
      ['not json', '{nope'],
      ['wrong shape', JSON.stringify({opens: 'x', engagedAt: 'y', returnDay: 5})],
      ['junk entries', JSON.stringify({opens: [null, 'a', {}, T0 - DAY]})],
    ])('recovers from %s without throwing', async (_label, raw) => {
      localStorage.setItem(ENGAGEMENT_STORAGE_KEY, raw)
      await expect(trackEngagementOnOpen(T0)).resolves.toBeDefined()
      expect(Array.isArray(stored().opens)).toBe(true)
    })

    it('ignores opens stamped in the future after a clock change', async () => {
      localStorage.setItem(ENGAGEMENT_STORAGE_KEY, JSON.stringify({
        opens: [T0 + (5 * DAY), T0 + (5 * DAY) + HOUR],
      }))
      await trackEngagementOnOpen(T0)
      expect(sentNames()).toEqual([])
      expect(stored().opens).toEqual([T0])
    })
  })

  describe('across tabs', () => {
    it('runs the read-compare-write-emit under a lock named for the storage key', async () => {
      const fake = installGatedFakeLocks()
      const first = trackEngagementOnOpen(T0 + (2 * HOUR))
      expect(fake.requests).toEqual([ENGAGEMENT_STORAGE_KEY])
      expect(window.gtag).not.toHaveBeenCalled()
      fake.open()
      await first
    })

    it('two tabs reaching the third open together send engaged_use once', async () => {
      await trackEngagementOnOpen(T0)
      await trackEngagementOnOpen(T0 + HOUR)
      const fake = installGatedFakeLocks()
      const a = trackEngagementOnOpen(T0 + (2 * HOUR))
      const b = trackEngagementOnOpen(T0 + (2 * HOUR) + 1000) // eslint-disable-line no-magic-numbers
      fake.open()
      await Promise.all([a, b])
      expect(sentNames().filter((n) => n === 'engaged_use')).toHaveLength(1)
    })
  })
})
