import {expect, Page, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {
  ADVANCED_HEAD_COOKIE,
  ADVANCED_VERSION,
  NEWER_VERSION,
  OLDER_VERSION,
  VERSION_HISTORY_PATH,
  versionCommits,
  versionContents,
} from '../../tests/fixtures/versionHistory'


const sourcePath = (ref: string) => `/share/v/gh/bldrs-ai/test-models/${ref}/${VERSION_HISTORY_PATH}`


/**
 * Open Navigation when needed and check the IFC project name from the model
 * data. Both revisions have the same GitHub path and filename.
 *
 * @param page Playwright page
 * @param project Expected IFC project name
 */
async function expectProject(page: Page, project: string) {
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(panel.getByText(project, {exact: false})).toBeVisible()
}


/**
 * Fall back to the same fixtures if a full navigation fetches GitHub before
 * the page is under MSW control. Keep the fallback scoped to this story.
 *
 * @param page Playwright page
 * @param advanced Whether the upstream branch has advanced
 */
async function routeVersionFallback(page: Page, advanced: boolean) {
  await page.context().route(
    /^https:\/\/api\.github\.com(?:\.[\w-]+)?\/repos\/bldrs-ai\/test-models\/(?:commits|contents\/.*)(?:\?.*)?$/,
    async (route) => {
      const url = new URL(route.request().url())
      const path = decodeURIComponent(url.pathname)
      if (path.endsWith('/commits') && url.searchParams.get('path')?.replace(/^\//, '') === VERSION_HISTORY_PATH) {
        await route.fulfill({json: versionCommits(advanced)})
      } else if (path.endsWith(`/contents/${VERSION_HISTORY_PATH}`)) {
        const contents = versionContents(url.searchParams.get('ref'), advanced)
        if (contents) {
          await route.fulfill({json: contents})
        } else {
          await route.fulfill({status: 404, json: {message: 'Not Found'}})
        }
      } else {
        await route.fallback()
      }
    },
  )
}


describeMobileAndDesktop('Versions 100: Open an exact GitHub revision', (formFactor) => {
  test('opens an older revision signed out and keeps it after the branch advances', async ({page, browser, baseURL}) => {
    await homepageSetup(page)
    await routeVersionFallback(page, false)
    await returningUserVisitsHomepageWaitForModel(page)
    await page.goto(sourcePath('main'))
    await waitForModelReady(page)
    await expect(page.getByTestId('AccountBoxOutlinedIcon')).toBeVisible()
    await expectProject(page, NEWER_VERSION.project)

    await page.getByTestId('control-button-versions').click()
    await page.getByTestId('timeline-list').getByText(OLDER_VERSION.message, {exact: true}).click()
    await expect.poll(() => new URL(page.url()).pathname).toBe(sourcePath(OLDER_VERSION.sha))
    await waitForModelReady(page)
    await expectProject(page, OLDER_VERSION.project)

    // A separate browser context has no cached model and sees a new branch head.
    const recipient = await browser.newPage({baseURL, viewport: page.viewportSize(), hasTouch: formFactor.isMobile})
    try {
      await homepageSetup(recipient)
      await routeVersionFallback(recipient, true)
      await recipient.context().addCookies([{name: ADVANCED_HEAD_COOKIE, value: '1', url: baseURL}])
      await returningUserVisitsHomepageWaitForModel(recipient)
      await recipient.goto(new URL(page.url()).pathname)
      await waitForModelReady(recipient)
      await expect.poll(() => new URL(recipient.url()).pathname).toBe(sourcePath(OLDER_VERSION.sha))
      await expectProject(recipient, OLDER_VERSION.project)
      await recipient.getByTestId('control-button-versions').click()
      await expect(recipient.getByTestId('timeline-list').getByText(ADVANCED_VERSION.message)).toBeVisible()
    } finally {
      await recipient.close()
    }
  })

  test('reports an unavailable commit without loading the branch head', async ({page}) => {
    await homepageSetup(page)
    await routeVersionFallback(page, true)
    await returningUserVisitsHomepageWaitForModel(page)

    const missing = sourcePath('4444444444444444444444444444444444444444')
    await page.goto(missing)

    await expect(page.getByTestId('LoadStatusLine')).toContainText("GitHub couldn't find this file")
    await expect.poll(() => new URL(page.url()).pathname).toBe(missing)
    await expect(page.getByTestId('cadview-dropzone')).toHaveAttribute('data-model-ready', 'false')
  })
})
