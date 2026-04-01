import path from 'path'
import {expect, Page, test} from '@playwright/test'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../../tests/e2e/utils'


declare global {
  interface Window {
    __lastPicker: {_callback?: (data: {action: string, docs: object[]}) => void} | undefined
  }
}


const GOOGLE_APIS_FAKE_PATH = path.resolve(process.cwd(), 'src/Components/Connections/googleApisFake.js')
const TEST_FILE_ID = 'fake-drive-file-id-123'
const TEST_FILE_NAME = 'test-model.ifc'

const {beforeEach, describe} = test


/**
 * Navigate to the Sources tab in the Open Model dialog.
 *
 * @param page - Playwright page object
 */
async function openSourcesTab(page: Page) {
  await page.getByTestId('control-button-open').click()
  await page.getByRole('tab', {name: 'Google'}).click()
}


/**
 * Tests for the Google Drive connection flow.
 *
 * External Google APIs (GIS OAuth, Picker) are replaced with synchronous fakes
 * loaded via addInitScript so no real popups or network calls to Google occur.
 * Google Drive REST API calls are handled by the MSW default googleapis handler
 * (returns empty JSON), which is sufficient for testing navigation behaviour.
 */
describe('Google Drive connection', () => {
  beforeEach(async ({page}) => {
    // Inject fake Google APIs before any page script runs
    await page.addInitScript({path: GOOGLE_APIS_FAKE_PATH})
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
    // Re-navigate with googleDrive feature flag so the Google tab is visible
    await page.goto('/share/v/p/index.ifc?feature=googleDrive', {waitUntil: 'domcontentloaded'})
    await openSourcesTab(page)
  })

  test('shows empty state with Connect Google Drive button', async ({page}) => {
    await expect(page.getByTestId('sources-tab-empty')).toBeVisible()
    await expect(page.getByTestId('button-connect-google-drive')).toBeVisible()
  })

  test('connect Google Drive stores connection and shows Open File button', async ({page}) => {
    await page.getByTestId('button-connect-google-drive').click()

    // Tab transitions from empty state to connected state
    await expect(page.getByTestId('sources-tab')).toBeVisible()
    // A connection card and the Browse button should appear
    await expect(page.locator('[data-testid^="connection-card-"]')).toBeVisible()
    await expect(page.locator('[data-testid^="button-browse-drive-"]')).toBeVisible()
  })

  describe('with a connected Google Drive account', () => {
    beforeEach(async ({page}) => {
      await page.getByTestId('button-connect-google-drive').click()
      await expect(page.getByTestId('sources-tab')).toBeVisible()
    })

    test('clicking Browse opens the Google Picker', async ({page}) => {
      await page.locator('[data-testid^="button-browse-drive-"]').click()

      // The fake picker should be built and stored at window.__lastPicker
      await page.waitForFunction(() => !!window.__lastPicker)
    })

    test('selecting a file in the picker navigates to the model viewer', async ({page}) => {
      await page.locator('[data-testid^="button-browse-drive-"]').click()
      await page.waitForFunction(() => !!window.__lastPicker)

      // Simulate a file selection via the fake picker callback
      await page.evaluate(({fileId, fileName}) => {
        const picker = window.__lastPicker
        if (picker?._callback) {
          picker._callback({
            action: 'PICKED',
            docs: [{
              id: fileId,
              name: fileName,
              url: `https://drive.google.com/file/d/${fileId}`,
              mimeType: 'application/x-step',
              parentId: '',
            }],
          })
        }
      }, {fileId: TEST_FILE_ID, fileName: TEST_FILE_NAME})

      // URL should change to /v/g/<fileId> preserving Google Drive source info
      await expect(page).toHaveURL(/\/v\/g\//, {timeout: 10_000})
    })

    test('cancelling the picker keeps the dialog open', async ({page}) => {
      await page.locator('[data-testid^="button-browse-drive-"]').click()
      await page.waitForFunction(() => !!window.__lastPicker)

      // Simulate picker cancellation
      await page.evaluate(() => {
        const picker = window.__lastPicker
        if (picker?._callback) {
          picker._callback({action: 'CANCEL', docs: []})
        }
      })

      // Dialog stays open; no navigation
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page).not.toHaveURL(/\/v\/new\//)
    })
  })
})
