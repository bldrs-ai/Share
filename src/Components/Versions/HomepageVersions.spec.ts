import {expect, Page, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {HOME_PATH, rememberShownModel, waitForModelOtherThan} from '../../tests/e2e/modelSwitch'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../../tests/e2e/utils'


const previewName = 'Redesigned B building'
const previewPath = /^\/share\/v\/p\/homepage-versions\/[0-9a-f]{40}\/index\.ifc$/


/**
 * Open the nav tree to check the model data behind the viewed revision.
 *
 * @param page Playwright page
 * @return The nav tree
 */
async function showNavTree(page: Page) {
  const tree = page.getByTestId('NavTreePanel')
  if (!await tree.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(tree).toBeVisible()
  return tree
}


describeMobileAndDesktop('Versions: Homepage demo', () => {
  test('keeps the original as the default and opens the preview by commit signed out', async ({page}) => {
    const gitRequests: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path.includes('/homepage-versions/') || path.endsWith('/homepageGit.js')) {
        gitRequests.push(path)
      }
    })

    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
    await expect(page.getByTestId('AccountBoxOutlinedIcon')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(HOME_PATH)
    expect(gitRequests).toEqual([])

    await rememberShownModel(page, 'live')
    await page.getByTestId('control-button-versions').click()
    const timeline = page.getByTestId('timeline-list')
    await expect(timeline.getByText('Original homepage model')).toBeVisible()
    await expect(timeline.getByTestId('commit')).toHaveCount(2)
    expect(gitRequests.some((path) => path.startsWith('/homepage-versions/repository/objects/'))).toBe(true)
    expect(gitRequests.every((path) => !path.endsWith('.ifc'))).toBe(true)

    await timeline.getByText('Preview the redesigned B building').click()
    await expect.poll(() => new URL(page.url()).pathname).toMatch(previewPath)
    await waitForModelOtherThan(page, 'live')
    const permalink = new URL(page.url()).pathname

    // Toggle the versions tab on as needed, as the viewer may reset panels
    // when it switches to a new model.
    if (!await timeline.isVisible()) {
      await page.getByTestId('control-button-versions').click()
    }
    await page.getByRole('button', {name: 'Back to live model'}).click()
    await expect.poll(() => new URL(page.url()).pathname).toBe(HOME_PATH)
    await waitForModelReady(page)

    // Open just the pinned path, without state from the timeline click.
    await page.goto(permalink)
    await waitForModelReady(page)
    const tree = await showNavTree(page)
    for (const name of ['Bldrs', 'Build', 'Every', 'Thing']) {
      await tree.getByText(name, {exact: true}).click()
    }
    await expect(tree.getByText(previewName, {exact: true})).toBeVisible()
    await expect(tree.getByText('Together', {exact: true})).toHaveCount(6)
  })
})
