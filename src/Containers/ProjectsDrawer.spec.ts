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
    await visitHomepageWaitForModel(page, {pauseRenderer: true})
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

  test('design system: primary actions are accent, the open model row is cyan-selected', async ({page}) => {
    // Pinned to Day so the exact Day token values below apply; the
    // theme otherwise follows the OS scheme.
    await page.emulateMedia({colorScheme: 'light'})
    await visitWithWorkspace(page)
    await ensureProjectsDrawerOpen(page)

    // accent (#5555ff) — the MUI default would be the grey
    // primary.main (#c1c1c1), which is what this drawer shipped with —
    // in sentence case, as the design system's Button sets it, not MUI's
    // upper-cased default.
    await expect(page.getByTestId('projects-new-button'))
      .toHaveCSS('background-color', 'rgb(85, 85, 255)')
    await expect(page.getByTestId('projects-new-button')).toHaveCSS('text-transform', 'none')
    await page.getByTestId('projects-new-button').click()
    await expect(page.getByTestId('projects-new-create'))
      .toHaveCSS('background-color', 'rgb(85, 85, 255)')
    await page.keyboard.press('Escape')

    // The home model we arrived on is the open one, listed Ungrouped.
    // surface-selected (#00f0ff40), not MUI's grey selected wash, and
    // the label at the DS's selected weight.
    const row = page.locator(UNGROUPED_ROWS).first()
    await expect(row).toHaveClass(/Mui-selected/)
    await expect(row).toHaveCSS('background-color', 'rgba(0, 240, 255, 0.25)')
    await expect(row.locator('.MuiListItemText-primary')).toHaveCSS('font-weight', '500')

    // The paper layer: header and logo footer on workspacePaper — neutral
    // light grey in Day — around the list; New project heads the list at
    // the DS's 36px rather than a full control row.
    await expect(page.getByTestId('projects-header-band'))
      .toHaveCSS('background-color', 'rgb(245, 245, 245)')
    await expect(page.getByTestId('projects-footer-band'))
      .toHaveCSS('background-color', 'rgb(245, 245, 245)')
    // The list on an inset grey-paper panel inside a glass frame, like the
    // right-hand drawer: #F5F5F5 at 0xA0 alpha.
    await expect(page.getByTestId('projects-panel'))
      .toHaveCSS('background-color', 'rgb(245, 245, 245)')
    // Flat, not raised like a Notes card: the list is the drawer's floor.
    await expect(page.getByTestId('projects-panel')).toHaveCSS('box-shadow', 'none')
    await expect(page.getByTestId('ProjectsDrawer'))
      .toHaveCSS('background-color', 'rgba(245, 245, 245, 0.627)')
    await expect(page.getByTestId('projects-new-button')).toHaveCSS('height', '36px')

    // The TopBar continues the drawer header's paper band and hairline.
    await expect(page.getByTestId('TopBar')).toHaveCSS('background-color', 'rgb(245, 245, 245)')
    await expect(page.getByTestId('TopBar'))
      .toHaveCSS('border-bottom-color', 'rgba(16, 16, 16, 0.12)')

    // A border hairline divides the centre pane from the right drawer.
    // Desktop only: on a phone the drawer is the bottom sheet.
    if (!ff.isMobile) {
      await page.getByTestId('control-button-notes').click()
      await expect(page.getByTestId('NotesAndPropertiesDrawer').getByTestId('SideDrawer-Paper'))
        .toHaveCSS('border-left-color', 'rgba(16, 16, 16, 0.12)')
    }
  })

  test('logo menu: About opens in-app, marketing pages link out', async ({page}) => {
    await visitWithWorkspace(page)
    await ensureProjectsDrawerOpen(page)
    await page.getByTestId('workspace-logo-button').click()

    const menu = page.getByTestId('workspace-logo-menu')
    await expect(menu).toContainText('Build Every Thing Together')
    await expect(menu).toContainText('Fastest browser-based CAD')
    await expect(page.getByTestId('workspace-logo-menu-pricing'))
      .toHaveAttribute('href', '/pricing/')
    await expect(page.getByTestId('workspace-logo-menu-news'))
      .toHaveAttribute('href', '/blog/')

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

      // New project stays reachable on the rail, as an accent disc that
      // opens the same dialog without reopening the drawer.
      await page.getByTestId('projects-rail-new-button').click()
      await expect(page.getByTestId('projects-new-name')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('projects-new-name')).toHaveCount(0)

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

    test('New project scrolls with a long project list', async ({page}) => {
      // Enough projects to overflow the drawer, seeded straight into the
      // workspace store (src/workspace/persistence.ts) before load.
      const projectCount = 15
      await page.addInitScript((count) => {
        const projects = Array.from({length: count}, (_, i) => ({id: `seed-${i}`, name: `Project ${i}`, models: []}))
        localStorage.setItem('bldrs:workspace-projects', JSON.stringify({version: 1, projects, ungrouped: []}))
      }, projectCount)
      await visitWithWorkspace(page)
      const scroll = page.getByTestId('projects-scroll')
      await expect(page.locator('[data-testid^="project-seed-"]')).toHaveCount(projectCount)

      const before = await page.getByTestId('projects-new-button').boundingBox()
      const scrolled = await scroll.evaluate((el) => {
        el.scrollTop = 120
        return el.scrollTop
      })
      expect(scrolled).toBeGreaterThan(0)
      await expect.poll(async () => (await page.getByTestId('projects-new-button').boundingBox())?.y)
        .toBeLessThan((before?.y ?? 0) - (scrolled / 2))
    })

    test('resize: New project stays on one line at the narrowest width', async ({page}) => {
      await visitWithWorkspace(page)
      const drawer = page.getByTestId('ProjectsDrawer')
      const box = await drawer.getByTestId(ID_RESIZE_HANDLE_X).boundingBox()
      const drawerBox = await drawer.boundingBox()
      if (drawerBox === null || box === null) {
        throw new Error('drawer or its resize grip is not laid out')
      }

      // Just above the 120px collapse threshold, where the 21px inset
      // leaves the label far less room than "NEW PROJECT" needs.
      const narrowWidth = 125
      const midY = box.y + (box.height / 2)
      await page.mouse.move(box.x + (box.width / 2), midY)
      await page.mouse.down()
      await page.mouse.move(drawerBox.x + narrowWidth, midY, {steps: 10})
      await page.mouse.up()

      const button = page.getByTestId('projects-new-button')
      await expect(button).toBeVisible()
      expect((await drawer.boundingBox())?.width).toBeLessThan(drawerBox.width)
      // A wrapped label grows past the fixed 36px height and spills out.
      const overflows = await button.evaluate((el) => el.scrollHeight > el.clientHeight)
      expect(overflows).toBe(false)
    })
  }
})
