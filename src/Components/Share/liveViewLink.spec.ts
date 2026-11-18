import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * The live view link (Share/viewLink.js) for the display: like the camera's
 * (Camera/liveCameraLink.spec.ts), the `#d:` token follows the display once
 * the user has changed it, in place (no history entry per change), while the
 * Share dialog's "Display settings" switch is on, and a link's own token is
 * left alone until then.
 *
 * Fixture: the colorless NIST as1 variant, whose Display menu offers Color,
 * so there is a non-default display to write (see shareDisplay.spec.ts).
 */
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-colorless.stp'
const TEST_TIMEOUT_MS = 90_000
// Well past the link's debounce (utils/debounce.js HASH_DEBOUNCE_WAIT_MS).
const PAST_DEBOUNCE_MS = 1000


/**
 * @param page Playwright page
 * @return the page's `#d:` token, or null
 */
function displayToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // Sets are `;`-separated (utils/location.js FEATURE_SEP); the dialog
    // writes `c:` beside it.
    const set = window.location.hash.substring(1).split(';').find((s) => s.startsWith('d:'))
    return set ?? null
  })
}


/**
 * Pick a color mode in the Display menu, then close it.
 *
 * @param page Playwright page
 * @param mode the radio's value
 */
async function pickColorMode(page: Page, mode: 'source' | 'auto') {
  await page.getByTestId('control-button-residency').click()
  // By test id: "Auto" also labels the motion-residency switch.
  await page.getByTestId(`color-mode-${mode}`).locator('input').check()
  // The popover is modal; dismiss it before reaching the bottom bar again.
  await page.keyboard.press('Escape')
}


/**
 * Open the model cold, with an optional hash suffix. The intercept keys on
 * the GitHub API URL, so the suffix doesn't disturb it (as
 * displayPermalink.spec.ts opens its links).
 *
 * @param page Playwright page
 * @param suffix appended to the model's route, e.g. a `#d:` token
 */
async function loadModel(page: Page, suffix = '') {
  const {waitForModelResponse} = await setupVirtualPathIntercept(page, AS1_PATH, '')
  await Promise.all([
    waitForModelResponse(),
    page.goto(`${AS1_PATH}${suffix}`, {waitUntil: 'domcontentloaded'}),
  ])
  await waitForModelReady(page)
}


/**
 * @param page Playwright page
 * @param prefix a hash set's prefix, e.g. `cp`
 * @return whether the page's hash has that set
 */
function hasSet(page: Page, prefix: string): Promise<boolean> {
  return page.evaluate((p) =>
    window.location.hash.substring(1).split(';').some((set) => set.startsWith(`${p}:`)), prefix)
}


/**
 * @param page Playwright page
 * @return whether the Display menu shows Source colors
 */
async function isSourceShown(page: Page): Promise<boolean> {
  await page.getByTestId('control-button-residency').click()
  const checked = await page.getByTestId('color-mode-source').locator('input').isChecked()
  await page.keyboard.press('Escape')
  return checked
}


describeMobileAndDesktop('Live view link: display', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('a Display menu change follows into the link in place, and the link opens with it', async ({page}) => {
    await loadModel(page)
    expect(await displayToken(page)).toBe(null)
    const historyLength = await page.evaluate(() => window.history.length)

    await pickColorMode(page, 'source')
    await expect.poll(() => displayToken(page)).toBe('d:color=src')
    await pickColorMode(page, 'auto')
    // Back at its default, the term goes, and so does the empty token.
    await expect.poll(() => displayToken(page)).toBe(null)
    await pickColorMode(page, 'source')
    await expect.poll(() => displayToken(page)).toBe('d:color=src')
    // Three changes, no history entries: Back leaves the model rather than
    // stepping through each.
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength)

    // The link opens with the display it carries: a fresh load of it, from
    // a blank page. The model now comes from the local cache, so wait for the
    // model, not its download.
    const url = page.url()
    await page.goto('about:blank')
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    expect(await isSourceShown(page)).toBe(true)
  })

  test('a link\'s token stays as it is until the user changes the display', async ({page}) => {
    // Terms out of the writer's order (it writes color before res): any
    // write before the user's change would reorder them, so leaving them be
    // is visible (a token a write would reproduce byte for byte couldn't
    // tell a premature write from none).
    await loadModel(page, '#d:res=40,color=src')
    // Applied (the menu shows it), and not rewritten by the load.
    expect(await isSourceShown(page)).toBe(true)
    await page.waitForTimeout(PAST_DEBOUNCE_MS)
    expect(await displayToken(page)).toBe('d:res=40,color=src')
    // The user's change: followed, in the writer's order.
    await pickColorMode(page, 'auto')
    await expect.poll(() => displayToken(page)).toBe('d:res=40')
  })

  test('with the Share dialog\'s display switch off, a change writes nothing', async ({page}) => {
    await loadModel(page)
    await page.getByTestId('control-button-share').click()
    await page.getByTestId('toggle-display').click()
    await expect(page.getByTestId('toggle-display')).not.toHaveAttribute('class', /Mui-checked/)
    await page.keyboard.press('Escape')

    await pickColorMode(page, 'source')
    // Longer than the link's debounce: nothing lands.
    await page.waitForTimeout(PAST_DEBOUNCE_MS)
    expect(await displayToken(page)).toBe(null)

    // Back on (the dialog writes the current display), and the next change
    // is followed.
    await page.getByTestId('control-button-share').click()
    await page.getByTestId('toggle-display').click()
    await expect(page.getByTestId('toggle-display')).toHaveAttribute('class', /Mui-checked/)
    await page.keyboard.press('Escape')
    await expect.poll(() => displayToken(page)).toBe('d:color=src')
    await pickColorMode(page, 'auto')
    await expect.poll(() => displayToken(page)).toBe(null)
  })

  test('the Share dialog\'s Cut planes switch removes the planes and leaves the rest of the link', async ({page}) => {
    await loadModel(page)
    await pickColorMode(page, 'source')
    await expect.poll(() => displayToken(page)).toBe('d:color=src')
    await page.getByTestId('control-button-cut-plane').click()
    await page.getByTestId('menu-item-plan').click()
    await expect(page.getByTestId('menu-cut-plane')).toBeHidden()
    await expect.poll(() => hasSet(page, 'cp')).toBe(true)

    // The dialog adds the camera; the cut planes and display are on too.
    await page.getByTestId('control-button-share').click()
    await expect.poll(() => hasSet(page, 'c')).toBe(true)
    await page.getByTestId('toggle-cutplane').click()
    // The planes go; the camera and the display, written in place, stay.
    await expect.poll(() => hasSet(page, 'cp')).toBe(false)
    expect(await hasSet(page, 'c')).toBe(true)
    expect(await displayToken(page)).toBe('d:color=src')
  })
})
