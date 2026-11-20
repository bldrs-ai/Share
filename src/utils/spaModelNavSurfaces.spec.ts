import {readFileSync} from 'fs'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept} from '../tests/e2e/models'
import {
  BOX_PATH,
  HOME_PATH,
  isSameDocument,
  markDocument,
  rememberShownModel,
  waitForModelOtherThan,
  waitForModelSettled,
} from '../tests/e2e/modelSwitch'
import {
  auth0Login,
  homepageSetup,
  setIsReturningUser,
  setupAuthenticationIntercepts,
} from '../tests/e2e/utils'


/**
 * Every open surface opens its model in-app, the default since open-205 step
 * F (Phase 1a step C, #2021): each goes through
 * navigate.js#navigateToModel with the caller's react-router `navigate`, so
 * the switch keeps the document. For each: start on the home model, open
 * another from the surface as a user would, and check that
 * - the document is the same one (a `window` marker survives a switch, not
 *   a page load),
 * - the model shown is the new one, a model object other than the home
 *   model's, at the surface's URL,
 * - the page's own `?feature=` (none, or the ProjectsDrawer's `workspace`)
 *   is the one still in the URL: an open neither drops nor adds a flag.
 *
 * On a plain link, so each runs on the default path. The way back to a page
 * load, `?feature=disableSpaModelNav`, is spaModelNav.spec.ts's.
 *
 * Not here, and why (recorded on #2021): My Exports (`ExportsList.jsx`) is
 * not mounted anywhere in the app today (SaveModelControl's Export tab
 * leaves it out; glb-export-premium.md §4.5), so no user can reach it; its
 * navigateToModel call is pinned by ExportsList.test.jsx. The Open dialog's
 * Google Drive tab needs Google's Picker, which the E2E environment has no
 * double for. The search bar's link open is spaModelNav.spec.ts's, Back and
 * Forward spaModelHistory.spec.ts's.
 */
const SWITCH_TEST_TIMEOUT_MS = 90_000
const PICKED_FILE = 'public/index.ifc'
// An upload's id, `<uuid>.ifc`, under the `/v/local-only/` route (#1959).
const UPLOAD_PATH = /\/share\/v\/local-only\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.ifc/
// The Samples tab's Caffeine (sampleModelRoster.js), a hosted test-models
// path whose fixture is a small PDB (src/tests/fixtures/github/…/pdb/): the
// Momentum sample's route serves stub bytes, so its specs are skipped.
const CAFFEINE_PATH = '/share/v/gh/bldrs-ai/test-models/main/pdb/caffeine.pdb'
// The GitHub file browser's double (api-handlers-github.ts): @cypresstester's
// test-repo lists window.ifc, which downloads index.ifc's bytes from the test
// server.
const WINDOW_PATH = '/share/v/gh/cypresstester/test-repo/main/window.ifc'
// The commit the Versions panel lists first (net/github/Commits.fixture).
// Where SaveModelControl opens what it saved (the double's cypresstester
// repo answers every file with index.ifc's bytes).
const SAVED_NAME = 'saved-in-app.ifc'
const SAVED_PATH = `/share/v/gh/cypresstester/test-repo/main/${SAVED_NAME}`
const COMMIT_SHA = 'testsha1testsha1testsha1testsha1testsha1'
const BOX_AT_COMMIT_PATH = `/share/v/gh/bldrs-ai/test-models/${COMMIT_SHA}/ifc/misc/box.ifc`


describeMobileAndDesktop('open-205: each open surface opens in-app by default', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(SWITCH_TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
  })

  test('Open dialog, Samples: a sample opens in-app', async ({page}) => {
    await startOn(page, HOME_PATH)
    await page.getByTestId('control-button-open').click()
    await page.getByTestId('tab-samples').click()
    await page.getByTestId('dialog-open-model-samples').getByText('Caffeine').click()
    await expectOpenedInApp(page, new RegExp(CAFFEINE_PATH))
    await expect(page).toHaveTitle(/caffeine/i)
  })

  test('Open dialog, GitHub: a file picked in the browser opens in-app', async ({page}) => {
    await setupAuthenticationIntercepts(page)
    await startOn(page, HOME_PATH)
    await auth0Login(page)
    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'GitHub'}).click()
    await page.getByTestId('button-browse-github').click()
    await pickOption(page, 'openOrganization', '@cypresstester')
    await expect(page.getByTestId('enable-private-repos')).toBeVisible()
    await pickOption(page, 'openRepository', 'test-repo')
    await pickOption(page, 'openFile', 'window.ifc')
    await page.getByTestId('button-openfromgithub').click()
    await expectOpenedInApp(page, new RegExp(WINDOW_PATH))
    await expect(page.getByTestId('dialog-open')).toHaveCount(0)
  })

  test('Open dialog, Local: a picked file opens in-app', async ({page}) => {
    await startOn(page, HOME_PATH)
    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Local'}).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByTestId('button_open_file').click()
    await (await chooser).setFiles(PICKED_FILE)
    await expectOpenedInApp(page, UPLOAD_PATH)
    await expect(page).toHaveTitle(/^Local-only: /)
  })

  test('drag-and-drop: a dropped file opens in-app', async ({page}) => {
    await startOn(page, HOME_PATH)
    await dropFile(page, PICKED_FILE)
    await expectOpenedInApp(page, UPLOAD_PATH)
    await expect(page).toHaveTitle(/^Local-only: /)
  })

  test('drag-and-drop without OPFS: the in-memory open stays in-app', async ({page}) => {
    // The no-OPFS path (#1906, #1957) was always in-app, kill switch or not
    // (a page load would end the File it reads); by default the two are one
    // path (navigate.js#navigateToInMemoryModel).
    await page.addInitScript(() => {
      navigator.storage.getDirectory = () =>
        Promise.reject(new DOMException('The operation is insecure.', 'SecurityError'))
    })
    await startOn(page, HOME_PATH)
    await dropFile(page, PICKED_FILE)
    await expectOpenedInApp(page, UPLOAD_PATH)
    await expect(page).toHaveTitle(/^Local-only: /)
  })

  test('Versions panel: a commit opens in-app', async ({page}) => {
    // The commit's copy of box.ifc is a fixture of its own, under the
    // commit's sha (src/tests/fixtures/github/bldrs-ai/test-models/<sha>/):
    // MSW hands out a download URL naming the ref, fetched past page.route.
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
    await startOn(page, BOX_PATH)
    await page.getByTestId('control-button-versions').click()
    const timeline = page.getByTestId('timeline-list')
    await expect(timeline).toBeVisible()
    await timeline.locator('.MuiTimelineItem-root').first().click()
    await expectOpenedInApp(page, new RegExp(BOX_AT_COMMIT_PATH))
  })

  test('Save to GitHub: the saved model opens in-app', async ({page}) => {
    await setupAuthenticationIntercepts(page)
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
    // A GitHub model: its download is the File the dialog saves (opfsFile).
    await startOn(page, BOX_PATH)
    await auth0Login(page)
    await page.getByTestId('control-button-save').click()
    await page.getByRole('tab', {name: 'GitHub'}).click()
    await pickOption(page, 'saveOrganization', '@cypresstester')
    await pickOption(page, 'saveRepository', 'test-repo')
    await pickOption(page, 'saveBranch', 'main')
    await page.getByTestId('CreateFileId').locator('input').fill(SAVED_NAME)
    await page.getByRole('dialog').getByText('Save model', {exact: true}).click()
    await expectOpenedInApp(page, new RegExp(SAVED_PATH))
  })

  test('ProjectsDrawer (?feature=workspace): a listed model opens in-app', async ({page}) => {
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
    // A project holding box.ifc, as the drawer persists one
    // (workspace/persistence.ts), seeded before the app reads it.
    await page.addInitScript((boxPath) => {
      localStorage.setItem('bldrs:workspace-projects', JSON.stringify({
        version: 1,
        projects: [{id: 'p1', name: 'Maple Street', models: [{id: 'm1', label: 'box.ifc', path: boxPath}]}],
        ungrouped: [],
      }))
    }, BOX_PATH)
    await startOn(page, HOME_PATH, 'workspace')
    const reopenLogo = page.getByTestId('projects-logo-open')
    if (await reopenLogo.isVisible()) {
      await reopenLogo.click()
    }
    const row = page.getByTestId('project-model-m1')
    if (!(await row.isVisible())) {
      await page.getByText('Maple Street').click()
    }
    await row.click()
    await expectOpenedInApp(page, new RegExp(BOX_PATH), 'workspace')
    await expect(page.getByTestId('ProjectsDrawer')).toBeVisible()
  })
})


/**
 * Load `path`, with `feature` if one is given, let it settle, remember its model and mark the
 * document.
 *
 * @param page
 * @param path
 * @param feature the `?feature=` value
 */
async function startOn(page: Page, path: string, feature = '') {
  await page.goto(`${path}${feature ? `?feature=${feature}` : ''}`, {waitUntil: 'domcontentloaded'})
  await waitForModelSettled(page)
  await rememberShownModel(page, 'start')
  await markDocument(page)
}


/**
 * The open happened in this document: another model is shown, at a URL
 * matching `path`, with the page's `?feature=` as it was.
 *
 * @param page
 * @param path
 * @param feature the `?feature=` value expected to survive (null: none)
 */
async function expectOpenedInApp(page: Page, path: RegExp, feature: string | null = null) {
  await expect(page).toHaveURL(path)
  await waitForModelOtherThan(page, 'start')
  await expect(page).toHaveURL(path)
  expect(await isSameDocument(page), 'the open must not load a page').toBe(true)
  expect(new URL(page.url()).searchParams.get('feature')).toBe(feature)
  // No alert: a failed load also ends in a ready model (the home model).
  await expect(page.getByRole('dialog')).toHaveCount(0)
}


/**
 * Drop `file` on the viewer the way a user's drag would.
 *
 * @param page
 * @param file path from the repo root
 */
async function dropFile(page: Page, file: string) {
  const bytes = [...readFileSync(file)]
  const name = file.split('/').pop()
  await page.evaluate(([bytesArg, nameArg]) => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Drop target not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg as number[])], nameArg as string))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, [bytes, name])
}


/**
 * Open a Selector's dropdown and pick an option, as Github.spec.ts does (not
 * force-clicked: the closing menu's backdrop must be waited out).
 *
 * @param page
 * @param testId the Selector's data-testid
 * @param optionName the option's accessible name
 */
async function pickOption(page: Page, testId: string, optionName: string) {
  const combobox = page.getByTestId(testId).getByRole('combobox')
  await combobox.click()
  const option = page.getByRole('option', {name: optionName, exact: true})
  await option.waitFor({state: 'visible'})
  await option.click()
  await expect(combobox).toContainText(optionName)
}
