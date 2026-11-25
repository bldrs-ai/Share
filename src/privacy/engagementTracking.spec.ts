/* eslint-disable no-magic-numbers */
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'


// Same remote-sourced "real" model as src/Containers/realModelOpen.spec.ts.
const REAL_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'
// src/privacy/engagementTracking.js#ENGAGEMENT_STORAGE_KEY.
const STORAGE_KEY = 'bldrs.ga.engagement'
const DAY_MS = 24 * 60 * 60 * 1000


/**
 * The engaged-use events (Share#1960) in the page's dataLayer, with params.
 * See realModelOpen.spec.ts for why dataLayer is observable with gtag/js
 * blocked.
 *
 * @param page Playwright page object
 * @return [name, params] per engaged_use / return_visit event
 */
async function engagementEvents(page: Page): Promise<[string, Record<string, unknown>][]> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' &&
        (entry?.[1] === 'engaged_use' || entry?.[1] === 'return_visit'))
      .map((entry) => [String(entry[1]), {...entry[2]}] as [string, Record<string, unknown>])
  })
}


/**
 * Make the browser look like it already opened models at these ages.
 *
 * @param page Playwright page object
 * @param agesInDays how long ago each earlier open was
 */
async function seedEarlierOpens(page: Page, agesInDays: number[]) {
  await page.addInitScript(({key, ages, dayMs}) => {
    const now = Date.now()
    window.localStorage.setItem(key, JSON.stringify({
      opens: ages.map((age) => now - (age * dayMs)).sort(),
      engagedAt: null,
      returnDay: null,
    }))
  }, {key: STORAGE_KEY, ages: agesInDays, dayMs: DAY_MS})
}


/**
 * Browser GA is off (privacy/analytics.js#IS_BROWSER_GA_ON, 2026-11-25), so
 * the engaged-use tracker is dormant: even a visitor who accepted analytics
 * under #2051 (setIsReturningUser sets that cookie) gets no events and no
 * stored open history, and a history left from before is deleted on load.
 * The tracker's behavior with the switch on is engagementTracking.test.js's.
 */
describeMobileAndDesktop('engaged-use tracking while browser GA is off', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('a real open records no history and sends neither event', async ({page}) => {
    await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
    await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    // Guards the absences below against a model that never opened.
    await expect(page.getByTestId('cadview-dropzone')).toBeAttached()
    expect(await engagementEvents(page)).toEqual([])
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })

  test('a history left from before is deleted, and a third open in a week sends nothing', async ({page}) => {
    await seedEarlierOpens(page, [2, 1])
    await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
    await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    expect(await engagementEvents(page)).toEqual([])
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })
})
