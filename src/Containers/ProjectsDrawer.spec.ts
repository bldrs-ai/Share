import {Page, expect, test} from '@playwright/test'
import {
  LONG_TEST_TIMEOUT_SECONDS,
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
} from '../tests/e2e/utils'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {describeMobileAndDesktop, MOBILE_VIEWPORT} from '../tests/e2e/formFactor'
import {
  HOME_MODEL,
  WORKSPACE_FLAG,
  createProject,
  ensureProjectsDrawerOpen,
  visitWithWorkspace,
} from '../tests/e2e/workspace'


const {beforeEach} = test

// A second model on a distinct route from the home model. Two are
// needed for the "add model" flow: an armed capture deliberately
// ignores the pathname it was armed on (see ProjectsDrawer's capture
// effect), so a recorded model can only be observed by arriving
// somewhere else.
const SECOND_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'

const MODEL_ROWS = '[data-testid^="project-model-"]'
const UNGROUPED_ROWS = '[data-testid^="ungrouped-model-"]'
// The expando header shares the `ungrouped-add-to-` prefix with the
// per-project targets under it, so exclude it by exact id.
const ADD_TO_PROJECT_TARGETS =
  '[data-testid^="ungrouped-add-to-"]:not([data-testid="ungrouped-add-to-project"])'

// Kept as a literal rather than imported from HorizonResizerButton.jsx:
// importing that module into a .ts spec pulls the whole untyped
// component into the TS program and fails `yarn typecheck`.
const ID_RESIZE_HANDLE_X = 'resize-handle-x'


/**
 * Arm a capture on the given project and dismiss the Open dialog, then
 * arrive at SECOND_MODEL — the sequence a real "Add model" produces,
 * including the full page load between arming and recording.
 *
 * @param page Playwright page object
 */
async function addSecondModelViaCapture(page: Page) {
  await page.getByText('Add model').click()
  await expect(page.getByRole('dialog')).toContainText('Samples')
  await page.keyboard.press('Escape')
  await page.goto(`${SECOND_MODEL}${WORKSPACE_FLAG}`, {waitUntil: 'domcontentloaded'})
  await waitForModelReady(page)
}


/**
 * Happy path through each flow the ProjectsDrawer ships (epic assist-300
 * #1657, story #1661; plan `design/new/conversational-cad.md` §2.1-2.5,
 * shipped deltas §2.8). One test per flow, run per form factor — the
 * shared bodies go through `ensureProjectsDrawerOpen`, which absorbs the
 * one systematic mobile difference (the drawer starts collapsed to the
 * bottom-left logo on a fresh phone visit). Only the flows that
 * genuinely diverge — collapse/rail, resize, the mobile closed state —
 * branch on the form factor.
 *
 * Deliberately not covered here: picking a file through the Open
 * dialog's own source tabs. This file asserts that the dialog is armed
 * and that the drawer records whatever the open produced; driving
 * local/GitHub/Drive picking belongs to `OpenModelDialog.spec.ts`.
 */
describeMobileAndDesktop('ProjectsDrawer (?feature=workspace)', (ff) => {
  beforeEach(async ({page}) => {
    // Several flows chain two or three full model loads; under the
    // 4-worker parallel run that overruns the default 30s.
    test.setTimeout(LONG_TEST_TIMEOUT_SECONDS)
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('flag gates the drawer, and the shell owns the only logo', async ({page}) => {
    await visitHomepageWaitForModel(page)
    await expect(page.getByTestId('ProjectsDrawer')).toHaveCount(0)
    await expect(page.getByTestId('control-button-about')).toBeVisible()

    await visitWithWorkspace(page)
    await ensureProjectsDrawerOpen(page)
    await expect(page.getByTestId('workspace-logo-button')).toBeVisible()
    // BottomBar drops its AboutControl under the flag, so the drawer
    // footer is not a second brand mark.
    await expect(page.getByTestId('control-button-about')).toHaveCount(0)
  })

  test('create project: the dialog closes and the project opens expanded', async ({page}) => {
    await visitWithWorkspace(page)
    await createProject(page, 'Maple Street')

    // Expanded on create, so "Add model" — the only next step that
    // matters — needs no second click.
    await expect(page.getByText('Add model')).toBeVisible()
    await expect(page.getByTestId('projects-list').getByText('Maple Street')).toHaveCount(1)
  })

  test('add model: the drawer arms the Open dialog and records what it opened', async ({page}) => {
    await setupVirtualPathIntercept(page, SECOND_MODEL, 'box.ifc')
    await visitWithWorkspace(page)
    await createProject(page, 'Maple Street')

    await addSecondModelViaCapture(page)

    await ensureProjectsDrawerOpen(page)
    await expect(page.locator(MODEL_ROWS)).toHaveCount(1)
  })

  test('persistence: projects and their models survive a reload', async ({page}) => {
    await setupVirtualPathIntercept(page, SECOND_MODEL, 'box.ifc')
    await visitWithWorkspace(page)
    await createProject(page, 'Maple Street')
    await addSecondModelViaCapture(page)
    await ensureProjectsDrawerOpen(page)
    await expect(page.locator(MODEL_ROWS)).toHaveCount(1)

    await page.reload({waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)

    await ensureProjectsDrawerOpen(page)
    await expect(page.getByTestId('projects-list')).toContainText('Maple Street')
    await expect(page.locator(MODEL_ROWS)).toHaveCount(1)
  })

  test('open from the drawer: navigates to the model and keeps the flag', async ({page}) => {
    await setupVirtualPathIntercept(page, SECOND_MODEL, 'box.ifc')
    await visitWithWorkspace(page)
    await createProject(page, 'Maple Street')
    await addSecondModelViaCapture(page)

    // Back to the home model, then open the listed one from the drawer.
    await page.goto(`${HOME_MODEL}${WORKSPACE_FLAG}`, {waitUntil: 'domcontentloaded'})
    await waitForModel(page)
    await ensureProjectsDrawerOpen(page)
    await page.locator(MODEL_ROWS).first().click()
    await page.waitForURL(/box\.ifc/)
    await waitForModelReady(page)

    // navigateToModel does a full document load; dropping ?feature=
    // here would eject the user from the shell they are standing in.
    expect(page.url()).toContain('feature=workspace')
    await expect(page.getByTestId('ProjectsDrawer')).toBeVisible()
  })

  test('ungrouped: a model opened outside a project files into one', async ({page}) => {
    await visitWithWorkspace(page)
    await ensureProjectsDrawerOpen(page)
    // No project and no armed capture, so the home model we arrived on
    // is listed under Ungrouped rather than dropped.
    await expect(page.getByTestId('ungrouped-section')).toBeVisible()
    await expect(page.locator(UNGROUPED_ROWS)).toHaveCount(1)

    await createProject(page, 'Maple Street')

    await page.locator('[data-testid^="ungrouped-menu-"]').first().click()
    await page.getByTestId('ungrouped-add-to-project').click()
    await page.locator(ADD_TO_PROJECT_TARGETS).first().click()

    // Moved, not copied: the section empties and disappears entirely.
    await expect(page.getByTestId('ungrouped-section')).toHaveCount(0)
    await expect(page.locator(MODEL_ROWS)).toHaveCount(1)
  })

  test('logo menu: About opens in-app, marketing pages link out', async ({page}) => {
    await visitWithWorkspace(page)
    await ensureProjectsDrawerOpen(page)
    await page.getByTestId('workspace-logo-button').click()

    const menu = page.getByTestId('workspace-logo-menu')
    await expect(menu).toContainText('Build Every Thing Together')
    await expect(menu).toContainText('Fastest browser-based CAD')
    await expect(page.getByTestId('workspace-logo-menu-pricing'))
      .toHaveAttribute('href', 'https://bldrs.ai/pricing')
    await expect(page.getByTestId('workspace-logo-menu-news'))
      .toHaveAttribute('href', 'https://bldrs.ai/blog')

    await page.getByTestId('workspace-logo-menu-about').click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  if (ff.isMobile) {
    test('closed is just the logo; open is full width with no resize grip', async ({page}) => {
      await visitWithWorkspace(page)

      // Fresh phone visit starts collapsed: no rail, no header — the
      // bottom-left logo is the whole closed state.
      await expect(page.getByTestId('projects-logo-open')).toBeVisible()
      await expect(page.getByTestId('projects-collapse-toggle')).toHaveCount(0)
      await expect(page.getByTestId('projects-new-button')).toHaveCount(0)

      await ensureProjectsDrawerOpen(page)
      const box = await page.getByTestId('ProjectsDrawer').boundingBox()
      expect(box?.width).toBe(MOBILE_VIEWPORT.width)
      await expect(page.getByTestId(ID_RESIZE_HANDLE_X)).toHaveCount(0)

      // And back down to the bare logo via the header toggle.
      await page.getByTestId('projects-collapse-toggle').click()
      await expect(page.getByTestId('projects-logo-open')).toBeVisible()
      await expect(page.getByTestId('projects-new-button')).toHaveCount(0)
    })
  } else {
    test('collapse: rails down to project initials, reopens from the footer logo', async ({page}) => {
      await visitWithWorkspace(page)
      await createProject(page, 'Maple Street')

      await page.getByTestId('projects-collapse-toggle').click()
      await expect(page.getByTestId('projects-new-button')).toHaveCount(0)
      await expect(page.getByTestId('ProjectsDrawer')).toContainText('MS')

      // Collapsed is a preference, not a transient.
      await page.reload({waitUntil: 'domcontentloaded'})
      await waitForModel(page)
      await expect(page.getByTestId('projects-new-button')).toHaveCount(0)

      // The footer logo reopens while closed, and only carries the
      // marketing menu once the drawer is open again.
      await page.getByTestId('projects-logo-open').click()
      await expect(page.getByTestId('projects-new-button')).toBeVisible()
      await expect(page.getByTestId('workspace-logo-button')).toBeVisible()
    })

    test('resize: dragging the grip widens the drawer', async ({page}) => {
      await visitWithWorkspace(page)
      const drawer = page.getByTestId('ProjectsDrawer')
      const boxBefore = await drawer.boundingBox()
      // Scoped to this drawer — NavTree/Notes render the same grip.
      const box = await drawer.getByTestId(ID_RESIZE_HANDLE_X).boundingBox()
      if (boxBefore === null || box === null) {
        throw new Error('drawer or its resize grip is not laid out')
      }

      const midY = box.y + (box.height / 2)
      const dragBy = 200
      await page.mouse.move(box.x + (box.width / 2), midY)
      await page.mouse.down()
      await page.mouse.move(box.x + dragBy, midY, {steps: 10})
      await page.mouse.up()

      const boxAfter = await drawer.boundingBox()
      expect(boxAfter?.width).toBeGreaterThan(boxBefore.width)
    })
  }
})
