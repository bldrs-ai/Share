import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, pauseViewerRendering, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Hide and isolate ride the permalink's `#d:` token (visibilityHash.js):
 * what the user hides or isolates is written to the URL as they do it, and
 * opening that URL puts the model back the same way. Each test acts through
 * the real controls, checks the URL says what was done, reloads, and checks
 * the state came back — for IFC (element ids) and ADF (NavTree name paths).
 */
const IFC_ELEMENT = 621
const IFC_PATH = `/share/v/p/index.ifc/81/${IFC_ELEMENT}`
const ADF_PATH = '/share/v/gh/bldrs-ai/test-models/main/adf/PM.adf'
const ADF_FIXTURE = 'test-models/adf/PM.adf'
// Each test loads its model twice.
const TWO_LOADS_TIMEOUT_MS = 90_000


describeMobileAndDesktop('Permalink hide / isolate state (#d:)', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
  })

  test('IFC: Hide writes the element to the link, which opens with it hidden', async ({page}) => {
    await loadModel(page, IFC_PATH)
    await page.getByTestId('Hide').click()
    await expect.poll(() => displayToken(page)).toBe(`hide=e${IFC_ELEMENT}`)

    await reload(page)
    expect(await isolatorState(page)).toEqual({hidden: [IFC_ELEMENT], isolated: null})
    expect(await hiddenInStore(page)).toEqual([`${IFC_ELEMENT}`])

    // Show all empties the state, and the link with it.
    await page.getByTestId('Show all').click()
    await expect.poll(() => displayToken(page)).toBe(null)
  })

  test('IFC: Isolate writes the element to the link, which opens isolated', async ({page}) => {
    await loadModel(page, IFC_PATH)
    await page.getByTestId('Isolate').click()
    await expect.poll(() => displayToken(page)).toBe(`iso=e${IFC_ELEMENT}`)

    await reload(page)
    expect(await isolatorState(page)).toEqual({hidden: [], isolated: [IFC_ELEMENT]})
  })

  test('ADF: NavTree eyes write name paths to the link, which opens the same way', async ({page}) => {
    await setupVirtualPathIntercept(page, ADF_PATH, ADF_FIXTURE)
    await loadModel(page, ADF_PATH)
    const {row, expand} = await openTree(page)
    // Show the landmark curves the loader hides, and hide one crown.
    await expand('ADF (PM.adf)')
    await expand('Upper Jaw')
    await row('facc').getByTestId('unhide-icon').click()
    await expand('teeth')
    await expand('Tooth_07')
    await row('Tooth_07_crown').getByTestId('hide-icon').click()
    await expect.poll(() => displayToken(page)).toMatch(
      /^hide=n[^,+]*\/Tooth_07\/Tooth_07_crown,show=n[^,+]*Upper%20Jaw\/facc$/)
    const before = await shownState(page)
    expect(before['Tooth_07_crown']).toBe(false)
    expect(before['facc:Upper Jaw']).toBe(true)

    await reload(page)
    expect(await shownState(page)).toEqual(before)
  })
})


/**
 * @param page Playwright page
 * @param path model route
 */
async function loadModel(page: Page, path: string) {
  await page.goto(path)
  await waitForModelReady(page)
  // These tests read state, never pixels; see `pauseViewerRendering`.
  await pauseViewerRendering(page)
}


/**
 * Reopen the current URL, as following the shared link does.
 *
 * @param page Playwright page
 */
async function reload(page: Page) {
  await page.reload()
  await waitForModelReady(page)
  await pauseViewerRendering(page)
}


/**
 * @param page Playwright page
 * @return the `#d:` token's terms, or null without one
 */
function displayToken(page: Page): string | null {
  const hash = new URL(page.url()).hash.substring(1)
  const token = hash.split(';').find((part) => part.startsWith('d:'))
  return token ? token.substring('d:'.length) : null
}


/**
 * @param page Playwright page
 * @return the isolator's hidden ids, and its isolated ids while isolating
 */
function isolatorState(page: Page): Promise<{hidden: number[], isolated: number[] | null}> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iso = (window as any).useStore.getState().viewer.isolator
    return {
      hidden: [...iso.hiddenIds].sort(),
      isolated: iso.tempIsolationModeOn ? [...iso.isolatedIds].sort() : null,
    }
  })
}


/**
 * @param page Playwright page
 * @return the store's hidden element keys, which the NavTree eyes read
 */
function hiddenInStore(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hidden = (window as any).useStore.getState().hiddenElements
    return Object.keys(hidden).filter((key) => hidden[key]).sort()
  })
}


/**
 * Open the NavTree.
 *
 * @param page Playwright page
 * @return a row locator by label, and an idempotent expander
 */
async function openTree(page: Page) {
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(panel).toBeVisible()
  const row = (label: string) => panel.locator(`[data-node-label="${label}"]`)
  const expand = async (label: string) => {
    if (await row(label).getAttribute('data-is-expanded') === 'false') {
      await row(label).getByTestId('NavTreeNodeToggle').click()
    }
  }
  return {row, expand}
}


/**
 * Whether each crown, and each jaw's `facc` group (keyed `facc:<jaw>`), is
 * drawn: it and every ancestor visible.
 *
 * @param page Playwright page
 * @return name → shown
 */
function shownState(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const model = (window as any).useStore.getState().model
    const out: Record<string, boolean> = {}
    model.traverse((obj: any) => {
      if (obj.name.endsWith('_crown') || obj.name === 'facc') {
        let visible = true
        for (let o = obj; o; o = o.parent) {
          visible = visible && o.visible
        }
        out[obj.name === 'facc' ? `facc:${obj.parent.name}` : obj.name] = visible
      }
    })
    return out
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}
