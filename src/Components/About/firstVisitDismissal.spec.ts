import {readFileSync} from 'fs'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {clearState, homepageSetup, visitHomepageWaitForModel, waitForModel} from '../../tests/e2e/utils'


const DROPPED_FILE = 'public/index.ifc'
// handleFileDrop's OPFS path stores the upload under a fresh uuid and
// navigates there (utils/navigate.js#navigateToModel), a full page load.
const UPLOAD_ROUTE = /\/share\/v\/local-only\/[0-9a-f-]{36}\.ifc/


/**
 * Drop DROPPED_FILE on the viewer the way a user's drag would, through
 * ViewerContainer's dropzone handler.
 *
 * @param page Playwright page
 */
async function dropOnViewer(page: Page) {
  const bytes = [...readFileSync(DROPPED_FILE)]
  await page.evaluate((bytesArg) => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Dropzone not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg)], 'index.ifc'))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, bytes)
}


/**
 * A first-time visitor who dismisses the About dialog by clicking its
 * backdrop — not OK — then clicks past the onboarding overlay and drops a
 * model, gets that model. It used to replay About and the overlay instead:
 * only OK ran AboutControl#handleDialogClose, so the backdrop (and Escape,
 * and the X) closed the dialog without setting the first-time cookie, and
 * the page load the drop navigates with found the visitor still "first".
 */
describeMobileAndDesktop('First visit: About dismissed by its backdrop', () => {
  test.beforeEach(async ({page}) => {
    await clearState(page.context())
    await homepageSetup(page)
    await visitHomepageWaitForModel(page)
  })

  test('a first drop opens the model, without replaying About or onboarding', async ({page}) => {
    const dialog = page.getByRole('dialog')
    const overlay = page.getByTestId('onboarding-overlay')

    // 1. About is up for a first-timer; dismiss it on the backdrop, outside
    //    the dialog's paper.
    await expect(dialog).toBeVisible()
    await page.mouse.click(2, 2)
    await expect(dialog).toHaveCount(0)

    // 2. The onboarding overlay follows; click past it.
    await expect(overlay).toBeVisible()
    await overlay.click({position: {x: 2, y: 2}})
    await expect(overlay).toHaveCount(0)

    // 3. Drop a model and let it load.
    await dropOnViewer(page)
    await page.waitForURL(UPLOAD_ROUTE)
    await waitForModel(page)

    // 4. The model, not a replay of the first-visit flow. A first-timer's
    //    About is open from the store's first render (hashState.js
    //    #isVisibleInitially), so it would be up by now; the overlay only
    //    ever follows About closing.
    await expect(dialog).toHaveCount(0)
    await expect(overlay).toHaveCount(0)
  })
})
