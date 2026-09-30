import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Open dialog › Local › Browse survives a garbage collection while the
 * chooser is up.
 *
 * The loader creates its `<input type=file>`, clicks it and detaches it in one
 * synchronous turn (`utils/loader.js`), so unless something holds the element
 * it is collectable the moment the click handler returns — while the chooser
 * it opened is still waiting on the user. Under Playwright the loss is
 * visible: the `filechooser` event is emitted only after the chooser's DOM
 * node is resolved, and a collected node drops it silently (playwright-core
 * `crPage.js#_onFileChooserOpened`). That is the Browse that "opened no file
 * chooser" in CI shard 2 and sat out a test's whole budget (#1872, #1890).
 *
 * A GC in that window is luck in CI; here it is forced on every file-input
 * click, which makes the miss deterministic without the hold — 20 of 20
 * Browse clicks lost their chooser against the unfixed loader, 0 of 20 with
 * `holdUntilPicked`. So this fails, every run, if the hold goes.
 */
// `gc()` is only exposed with this V8 flag. A worker-scoped option, so it has
// to be set at file level; it replaces the project's launch args, which are
// font-rendering flags for screenshots and this spec takes none.
test.use({launchOptions: {args: ['--js-flags=--expose-gc']}})

// The sample the viewer opens by default — any file the loader accepts will
// do, and this one is small and already served.
const PICKED_FILE = 'public/index.ifc'
const CHOOSER_WAIT_MS = 15_000

describeMobileAndDesktop('Open 100: Browse opens a file chooser', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page)
    await setIsReturningUser(context)
    // Collect right after every file-input click, at the three points a
    // detached input would first be unreachable: the end of the click
    // handler's task (microtask), and the next two macrotasks.
    await page.addInitScript(() => {
      const click = HTMLInputElement.prototype.click
      HTMLInputElement.prototype.click = function() {
        click.call(this)
        if (this.type === 'file') {
          const collect = (globalThis as unknown as {gc: () => void}).gc
          queueMicrotask(collect)
          setTimeout(collect, 0)
          setTimeout(collect, 5)
        }
      }
    })
    await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
  })

  test('a Browse pick reaches the loader even if the page collects garbage meanwhile', async ({page}) => {
    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Local'}).click()
    const browse = page.getByTestId('button_open_file')
    await expect(browse).toBeVisible()

    const waiting = page.waitForEvent('filechooser', {timeout: CHOOSER_WAIT_MS})
    await browse.click()
    const chooser = await waiting
    await chooser.setFiles(PICKED_FILE)

    // Past the chooser the pick goes through OPFS and navigates to the stored
    // copy — the proof the input's `change` handler ran on the element Browse
    // made, not merely that a chooser appeared.
    await expect(page).toHaveURL(/\/share\/v\/new\/.+\.ifc/)
    await waitForModelReady(page)
  })
})
