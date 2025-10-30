import {Page, expect} from '@playwright/test'
import {readFile} from 'fs/promises'
import {join} from 'path'


/**
 * Setup route intercept for github model loading.  The return value is a callback
 * to invoke when ready to wait for model ready.
 *
 * @param page Playwright page object
 * @param proxyPathname GitHub proxy pathname, e.g. '/bldrs-ai/test-models/main/ifc/misc/box.ifc'
 * @param gotoPathname Pathname to navigate to,
 *   e.g. '/share/v/gh/.../box.ifc'
 *   or null if caller should handle navigation.
 * @param fixtureFilename Fixture file, e.g. 'box.ifc'
 * @return A wait for model ready callback.
 */
export async function setupGithubPathIntercept(
  page: Page,
  proxyPathname: string,
  gotoPathname: string | undefined,
  fixtureFilename: string,
): Promise<() => Promise<void>> {
  if (!proxyPathname.startsWith('/')) {
    throw new Error(`GitHub proxy pathname must start with '/': ${proxyPathname}`)
  }
  const proxyBase = 'https://rawgit.bldrs.dev/r' // since it will be appended to this
  const interceptPrefix = `${proxyBase}${proxyPathname}`
  return await setupRouteIntercept(page, interceptPrefix, gotoPathname, fixtureFilename)
}


/**
 * Setup route intercept for google drive model loading.  The return value is a callback
 * to invoke when ready to wait for model ready.
 *
 * @param page Playwright page object
 * @param googleDriveFildId Google Drive file ID, e.g. '1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO'
 * @param gotoPathname Pathname to navigate to,
 *   e.g. '/share/v/g/https://drive.google.com/file/d/1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO/view'
 *   or null if caller should handle navigation.
 * @param fixtureFilename Fixture file, e.g. 'box.ifc'
 * @return A wait for model ready callback.
 */
export async function setupGoogleDrivePathIntercept(
  page: Page,
  googleDriveFildId: string,
  gotoPathname: string | undefined,
  fixtureFilename: string, // e.g. 'Momentum.ifc'
): Promise<() => Promise<void>> {
  const interceptPrefix = `https://www.googleapis.com/drive/v3/files/${googleDriveFildId}`
  return await setupRouteIntercept(page, interceptPrefix, gotoPathname, fixtureFilename)
}


// Don't export this function, it's internal helper for
// setupGithubPathIntercept and setupGoogleDrivePathIntercept.
/**
 * Setup route intercept for model loading.  The return value is a callback
 * to invoke when ready to wait for model ready.
 *
 * @param page Playwright page object
 * @param interceptPrefix Virtual path to intercept
 * @param gotoPathname Pathname to navigate to, e.g.
 *   '/share/v/g/.../box.ifc'
 *   '/share/v/gh/.../box.ifc'
 *   or null if caller should handle navigation.
 * @param fixtureFilename Fixture file, e.g. 'box.ifc'
 * @return A wait for model ready callback.
 */
async function setupRouteIntercept(
  page: Page, interceptPrefix: string, gotoPathname: string | undefined, fixtureFilename: string):
  Promise<() => Promise<void>> {
  const interceptRoute = `${interceptPrefix}*`
  console.log('setupRouteIntercept: seting up intercept:', interceptRoute)
  await page.route(interceptRoute, async (route) => {
    const fixturesDir = 'src/tests/fixtures'
    const body = await readFile(join(fixturesDir, fixtureFilename))
    await route.fulfill({
      status: 200,
      headers: {'content-type': 'application/octet-stream'},
      body,
    })
  })

  return async () => {
    console.log('waitForModelReadyCallback: waiting for intercept:', interceptRoute)
    console.log('waitForModelReadyCallback: navigating to:', gotoPathname)
    await Promise.all([
      page.waitForResponse((r) => r.url().startsWith(interceptPrefix)),
      gotoPathname ? page.goto(gotoPathname, {waitUntil: 'domcontentloaded'}) : Promise.resolve(),
    ])
  }
}


/**
 * Wait for model to be ready after loading
 * Playwright equivalent of cypress/support/models.js waitForModelReady
 *
 * @param page Playwright page object
 */
export async function waitForModelReady(page: Page) {
  // Wait for model ready attribute on dropzone (matching working tests)
  const dropzone = page.getByTestId('cadview-dropzone')
  const MODEL_READY_TIMEOUT = 15000
  await expect(dropzone).toHaveAttribute('data-model-ready', 'true', {timeout: MODEL_READY_TIMEOUT})
  // Wait for animations to settle (equivalent to cy.wait(animWaitTimeMs))
  const animWaitTimeMs = 1000
  await page.waitForTimeout(animWaitTimeMs)
}
