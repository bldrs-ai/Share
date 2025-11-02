import {expect, Page, test} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../tests/e2e/utils'


/**
 * Helper to set alert in the Zustand store
 *
 * @param page Playwright page object
 * @param alert Alert value (string, Error, or object)
 */
async function setAlert(page: Page, alert: string | Error | {type: string, message: string}) {
  await page.evaluate((alertValue: unknown) => {
    if (!(window as unknown as WindowWithStore).store) {
      throw new Error(
        'Zustand store not found on window – make sure win.store is set in test builds.',
      )
    }

    (window as unknown as WindowWithStore).store?.getState().setAlert(alertValue)
  }, alert)
}


/**
 * Helper to set snackMessage in the Zustand store
 *
 * @param page Playwright page object
 * @param message Snack message (string or object with text and autoDismiss, or null)
 */
async function setSnackMessage(page: Page, message: string | {text: string, autoDismiss: boolean} | null) {
  await page.evaluate((msg: unknown) => {
    if (!(window as unknown as WindowWithStore).store) {
      throw new Error(
        'Zustand store not found on window – make sure win.store is set in test builds.',
      )
    }

    (window as unknown as WindowWithStore).store?.getState().setSnackMessage(msg)
  }, message)
}


type WindowWithStore = Window & {
  store?: {
    getState: () => {
      setAlert: (alert: unknown) => void
      setSnackMessage: (message: unknown) => void
    }
  }
}


const {beforeEach, describe} = test
describe('Alert and Snackbar', () => {
  describe('AlertDialog', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('AlertDialog appears when alert is set with string error', async ({page}) => {
      await setAlert(page, 'Test error message')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('heading', {name: 'Error'})).toBeVisible()
      await expect(dialog.getByText('Test error message')).toBeVisible()
      await expect(dialog.getByTestId('button-dialog-main-action')).toHaveText('Reset')
    })

    test('AlertDialog can be closed via close button', async ({page}) => {
      await setAlert(page, 'Test error message')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.getByTestId('button-close-dialog-error').click()
      await expect(dialog).toBeHidden()
    })

    test('AlertDialog can be closed via Reset button', async ({page}) => {
      await setAlert(page, 'Test error message')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.getByTestId('button-dialog-main-action').click()
      await expect(dialog).toBeHidden()
    })

    test('AlertDialog shows Out of Memory alert with Refresh button', async ({page}) => {
      await setAlert(page, {type: 'oom', message: 'Out of memory error'})
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('heading', {name: 'Out of Memory'})).toBeVisible()
      await expect(dialog.getByText('Out of memory error')).toBeVisible()
      await expect(dialog.getByTestId('button-dialog-main-action')).toHaveText('Refresh')
      await expect(page.getByTestId('button-close-dialog-out-of-memory')).toBeVisible()
    })

    test('AlertDialog navigates to default route when closed', async ({page}) => {
      await setAlert(page, 'Test error message')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.getByTestId('button-dialog-main-action').click()
      await expect(dialog).toBeHidden()
      // Should navigate to default route after closing (hash may be present)
      await expect(page).toHaveURL(/\/share\/v\/p\/index\.ifc/)
    })
  })

  describe('Snackbar', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('Snackbar appears when snackMessage is set as string', async ({page}) => {
      await setSnackMessage(page, 'Test snack message')
      const snackbar = page.getByTestId('snackbar')
      await expect(snackbar).toBeVisible()
      await expect(snackbar.getByText('Test snack message')).toBeVisible()
      await expect(page).toHaveScreenshot('snackbar-string.png')
    })

    test('Snackbar appears when snackMessage is set as object', async ({page}) => {
      await setSnackMessage(page, {text: 'Auto-dismiss message', autoDismiss: true})
      const snackbar = page.getByTestId('snackbar')
      await expect(snackbar).toBeVisible()
      await expect(snackbar.getByText('Auto-dismiss message')).toBeVisible()
    })

    test('Snackbar can be closed via close button', async ({page}) => {
      await setSnackMessage(page, 'Test snack message')
      const snackbar = page.getByTestId('snackbar')
      await expect(snackbar).toBeVisible()
      const closeButton = snackbar.locator('button')
      await closeButton.click()
      await expect(snackbar).toBeHidden()
    })

    test('Snackbar auto-dismisses after 5 seconds when autoDismiss is true', async ({page}) => {
      await setSnackMessage(page, {text: 'Auto-dismiss message', autoDismiss: true})
      const snackbar = page.getByTestId('snackbar')
      await expect(snackbar).toBeVisible()
      // Wait for auto-dismiss (5 seconds + buffer)
      await expect(snackbar).toBeHidden({timeout: 6000})
    })

    test('Snackbar does not auto-dismiss when snackMessage is string', async ({page}) => {
      await setSnackMessage(page, 'Persistent message')
      const snackbar = page.getByTestId('snackbar')
      await expect(snackbar).toBeVisible()
      // Wait a bit to ensure it doesn't auto-dismiss
      const oneSecond = 1000
      await page.waitForTimeout(oneSecond)
      await expect(snackbar).toBeVisible()
    })
  })

  describe('Alert and Snackbar interaction', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('Both AlertDialog and Snackbar can be shown simultaneously', async ({page}) => {
      await setAlert(page, 'Error message')
      await setSnackMessage(page, 'Snack message')
      const dialog = page.getByRole('dialog')
      const snackbar = page.getByTestId('snackbar')
      await expect(dialog).toBeVisible()
      await expect(snackbar).toBeVisible()
    })

    test('Clearing snackMessage hides snackbar', async ({page}) => {
      await setSnackMessage(page, 'Test message')
      const snackbar = page.getByTestId('snackbar')
      await expect(snackbar).toBeVisible()
      await setSnackMessage(page, null)
      await expect(snackbar).toBeHidden()
    })
  })
})
