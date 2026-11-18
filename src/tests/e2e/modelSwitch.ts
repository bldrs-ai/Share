import {Page, expect} from '@playwright/test'
import {SEARCH_BAR_PLACEHOLDER_TEXT} from '../../Components/Search/component'
import {waitForModelReady} from './models'


/**
 * Helpers for specs that switch models in one page (open-205, #2011):
 * `?feature=spaModelNav` and the memory checks on what a switch frees.
 *
 * The second model is a hosted test-models fixture, served end to end by
 * MSW and the test server (models.ts#setupVirtualPathIntercept), opened by
 * typing its GitHub link into the search bar: SearchBar.jsx#onSubmit opens a
 * link through `navigateToModel`, so it is in-app under the flag and a page
 * load without it.
 */
export const HOME_PATH = '/share/v/p/index.ifc'
export const BOX_PATH = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'
export const BOX_LINK = 'https://github.com/bldrs-ai/test-models/main/ifc/misc/box.ifc'
// A third hosted fixture, for A → B → C.
export const WALL_PATH = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/cut-plane-pick.ifc'
export const WALL_LINK = 'https://github.com/bldrs-ai/test-models/main/ifc/misc/cut-plane-pick.ifc'
// Long enough for a fixture-sized model on a loaded CI shard, as
// waitForModelReady's own default is for one load.
const SWITCH_TIMEOUT_MS = 30_000
const WRITER_IDLE_TIMEOUT_MS = 30_000


/**
 * Wait until the shown model is ready and its idle GLB writer has settled.
 * The writer's closure holds the model and the viewer until it has run
 * (Loader.js), so a model counts as finished only after it.
 *
 * @param page
 */
export async function waitForModelSettled(page: Page) {
  await waitForModelReady(page, SWITCH_TIMEOUT_MS)
  await expect.poll(() => page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).store.getState().isCacheWriteInFlight), {timeout: WRITER_IDLE_TIMEOUT_MS}).toBe(false)
}


/**
 * Remember the shown model, weakly, as `name`, so a later check can tell
 * another model from it without the spec itself keeping it alive.
 *
 * @param page
 * @param name
 */
export async function rememberShownModel(page: Page, name: string) {
  await page.evaluate((key) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    w.__shownModels = w.__shownModels ?? {}
    // The repo's TS lib predates WeakRef; the browser has it.
    w.__shownModels[key] = new w.WeakRef(w.store.getState().model)
  }, name)
}


/**
 * Wait until a model other than the one remembered as `name` is ready.
 * `data-model-ready` alone can't say so: it is still true from the old model
 * for a moment after the route changes.
 *
 * @param page
 * @param name
 */
export async function waitForModelOtherThan(page: Page, name: string) {
  await expect.poll(() => page.evaluate((key) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    if (w.__shownModels?.[key] === undefined) {
      // Set in this document by rememberShownModel: gone means a page load.
      throw new Error(`no model remembered as ${key}: the page was loaded again`)
    }
    const {model, isModelReady} = w.store.getState()
    return Boolean(model) && isModelReady === true && model !== w.__shownModels[key].deref()
  }, name), {timeout: SWITCH_TIMEOUT_MS}).toBe(true)
  await waitForModelSettled(page)
}


/**
 * Open box.ifc by typing its GitHub link into the search bar.
 *
 * @param page
 */
export async function openBoxFromSearchBar(page: Page) {
  await openFromSearchBar(page, BOX_LINK, BOX_PATH)
}


/**
 * Open a hosted test-models fixture by typing its GitHub link into the
 * search bar, and wait for the route to change to it.
 *
 * @param page
 * @param link the fixture's github.com link
 * @param sharePath the share path it opens at
 * @return the URL (no origin) of the entry the open left, as a Back finds it:
 *   the page's just before Enter, less the search panel's `s:` set. The open
 *   closes the panel, so a Back to that entry finds it closed, and
 *   useHashState drops the token in place.
 */
export async function openFromSearchBar(page: Page, link: string, sharePath: string): Promise<string> {
  await page.getByTestId('control-button-search').click()
  const searchInput = page.getByPlaceholder(SEARCH_BAR_PLACEHOLDER_TEXT)
  await searchInput.fill(link)
  const left = new URL(page.url())
  await searchInput.press('Enter')
  await expect(page).toHaveURL(new RegExp(sharePath))
  const sets = left.hash.substring(1).split(';').filter((set) => set !== '' && set !== 's:' && !set.startsWith('s:'))
  return `${left.pathname}${left.search}${sets.length > 0 ? `#${sets.join(';')}` : ''}`
}


/**
 * Mark this document, so `isSameDocument` can later tell an in-app switch
 * from a page load: the marker lives on `window`, which a page load replaces.
 *
 * @param page
 */
export async function markDocument(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__sameDocument = true
  })
}


/**
 * @param page
 * @return whether the document `markDocument` marked is still the page's
 */
export function isSameDocument(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__sameDocument === true)
}
