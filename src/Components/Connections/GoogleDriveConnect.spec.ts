import path from 'path'
import {expect, Page, test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


declare global {
  interface Window {
    __lastPicker: {_callback?: (data: {action: string, docs: object[]}) => void} | undefined
  }
}


const GOOGLE_APIS_FAKE_PATH = path.resolve(process.cwd(), 'src/Components/Connections/googleApisFake.js')
// Shaped like a real Drive id (routes/google.ts#isValidDriveId: 25 to 44 of
// [A-Za-z0-9_-]). The old 22-character one was never a valid route: Share
// sent it on to the home model at once. While every open was a page load,
// the URL sat on /v/g/ while the next page booted, long enough for the check
// below; in-app (open-205 step F) the route is handled in the same tick, so
// the id has to be one the route takes.
const TEST_FILE_ID = 'fake-drive-file-id-0123456789'
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
 *
 * Identity-decoupling PR2 added an Auth0 primary-auth gate to
 * ConnectProviderButton: it stays disabled until the user signs in. We
 * satisfy the gate at the top-level beforeEach via auth0Login so every
 * test starts from an authenticated MockAuth0Context state, mirroring
 * the runtime expectation that connecting a Source presupposes a primary
 * identity. The "shows empty state" smoke test below still verifies the
 * button is visible (the gate doesn't hide it, just disables it).
 */
describe('Google Drive connection', () => {
  beforeEach(async ({page}) => {
    // Inject fake Google APIs before any page script runs
    await page.addInitScript({path: GOOGLE_APIS_FAKE_PATH})
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page, {connection: 'google'})
    // returningUserVisitsHomepageWaitForModel already lands on
    // /share/v/p/index.ifc with the model ready. A second goto used to
    // start another IFC+wasm load underneath every click (same trap as
    // Github.spec.ts / #1759). These tests never look at the canvas.
    await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
    // Satisfy the Auth0 primary-auth gate on ConnectProviderButton.
    await auth0Login(page, 'google')
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
      await expect(page).toHaveURL(new RegExp(`/v/g/${TEST_FILE_ID}`), {timeout: 10_000})
      // And Share took the route: the model being opened is the Drive file,
      // not the home model a bad id falls back to.
      await expect.poll(() => page.evaluate(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).store.getState().modelPath?.fileId ?? null)).toBe(TEST_FILE_ID)
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
      await expect(page).not.toHaveURL(/\/v\/(?:new|local-only)\//)
    })
  })
})
