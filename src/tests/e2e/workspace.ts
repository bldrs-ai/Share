import {Page, expect} from '@playwright/test'
import {waitForModel} from './utils'


export const WORKSPACE_FLAG = '?feature=workspace'
export const HOME_MODEL = '/share/v/p/index.ifc'


/**
 * Land on a model route with the workspace shell on — the state a user
 * is in when they first reach for the ProjectsDrawer.
 *
 * Pauses the viewer after the model is ready: every current caller
 * (ProjectsDrawer, TopBar) drives the shell, not the canvas, and the
 * SwiftShader render loop otherwise pins every click. Pass
 * `{pauseRenderer: false}` if a new caller needs the scene.
 *
 * @param page Playwright page object
 * @param path Model route, defaults to the home model
 * @param options.pauseRenderer Freeze the WebGL loop once ready (default true)
 */
export async function visitWithWorkspace(
  page: Page,
  path: string = HOME_MODEL,
  {pauseRenderer = true}: {pauseRenderer?: boolean} = {},
) {
  await page.goto(`${path}${WORKSPACE_FLAG}`, {waitUntil: 'domcontentloaded'})
  await waitForModel(page, {pauseRenderer})
  await expect(page.getByTestId('ProjectsDrawer')).toBeVisible()
}


/**
 * Open the ProjectsDrawer if it's closed, whichever closed form it's in.
 * The reopen affordance is the same bottom-left logo on both form
 * factors (`projects-logo-open` — desktop rail footer, mobile fixed
 * corner), so shared flow bodies call this instead of branching:
 * desktop's default-open drawer makes it a no-op, mobile's
 * default-collapsed first visit gets the tap it needs, and a stored
 * open preference is respected either way.
 *
 * @param page Playwright page object
 */
export async function ensureProjectsDrawerOpen(page: Page) {
  const reopenLogo = page.getByTestId('projects-logo-open')
  if (await reopenLogo.isVisible()) {
    await reopenLogo.click()
  }
  await expect(page.getByTestId('projects-new-button')).toBeVisible()
}


/**
 * Create a project through the dialog, as a user would. Opens the
 * drawer first if needed.
 *
 * @param page Playwright page object
 * @param name Project name to type
 */
export async function createProject(page: Page, name: string) {
  await ensureProjectsDrawerOpen(page)
  await page.getByTestId('projects-new-button').click()
  await page.getByTestId('projects-new-name').fill(name)
  await page.getByTestId('projects-new-create').click()
  await expect(page.getByTestId('projects-new-name')).toHaveCount(0)
  await expect(page.getByTestId('projects-list')).toContainText(name)
}
