/* eslint-disable no-magic-numbers */
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser, visitHomepageWaitForModel} from '../tests/e2e/utils'
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


describeMobileAndDesktop('engaged-use GA events', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('a first real open sends neither event and records the open', async ({page}) => {
    await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
    await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    expect(await engagementEvents(page)).toEqual([])
    const opens = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').opens, STORAGE_KEY)
    expect(opens).toHaveLength(1)
  })

  test('the third real open inside a week sends engaged_use, and a day-old open a return_visit', async ({page}) => {
    await seedEarlierOpens(page, [2, 1])
    await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
    await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    const events = await engagementEvents(page)
    expect(events.map(([name]) => name).sort()).toEqual(['engaged_use', 'return_visit'])
    const engaged = events.find(([name]) => name === 'engaged_use')?.[1]
    expect(engaged).toMatchObject({window_days: 7, opens_in_window: 3, threshold: 3})
  })

  test('the homepage demo is never an open', async ({page}) => {
    await seedEarlierOpens(page, [2, 1])
    await visitHomepageWaitForModel(page, {pauseRenderer: true})
    expect(await engagementEvents(page)).toEqual([])
    const opens = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').opens, STORAGE_KEY)
    expect(opens).toHaveLength(2)
  })
})
