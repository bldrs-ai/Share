import {Page, expect} from '@playwright/test'
import {readFile} from 'fs/promises'
import {join} from 'path'


/**
 * Set up virtual path intercept for model loading
 *
 * @param page Playwright page object
 * @param path Virtual path to intercept
 * @param fixturePath Path to fixture file
 * @return Object with intercept helpers
 */
export async function setupVirtualPathIntercept(
  page: Page,
  path: string, // e.g. '/share/v/gh/.../Momentum.ifc'
  fixturePath: string, // e.g. 'Momentum.ifc'
) {
  const sharePrefix = '/share/v/gh'
  if (!path.startsWith(sharePrefix)) {
    throw new Error(`Path must start with ${sharePrefix}`)
  }

  const fixturesDir = 'cypress/fixtures'
  /*
  // --- Bounce (serve HTML for SPA deep link) -------------------------------
  // Only fulfill the *document navigation* so React Router can take over.
  const bouncePattern = `**${path}*`
  console.log(`[models.ts setupVirtualPathIntercept] bounce routing: ${bouncePattern}`)
  await page.route(bouncePattern, async (route) => {
    const req = route.request()
    if (req.isNavigationRequest() || req.resourceType() === 'document') {
      const html404 = await readFile(join(fixturesDir, '404.html'), 'utf-8')
      console.log(`[models.ts setupVirtualPathIntercept] fulfilling ${req.url()}`)
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html404,
      })
    } else {
      // Let XHR/fetch for same path proceed (unlikely but safe)
      await route.continue()
    }
    page.unroute(bouncePattern)
  })
*/
  const proxyBase = 'https://rawgit.bldrs.dev.msw/model'
  // --- Proxy intercept (serve the IFC bytes) -------------------------------
  const ghPath = path.substring(sharePrefix.length) // keep Cypress logic
  const interceptUrl = `${proxyBase}${ghPath}`
  await page.route(`${interceptUrl}*`, async (route) => {
    const body = await readFile(join(fixturesDir, fixturePath))
    await route.fulfill({
      status: 200,
      headers: {'content-type': 'application/octet-stream'},
      body,
    })
  })

  // Return tiny “aliases” you can await in tests
  const waitForModelRequest = () =>
    page.waitForRequest((r) => r.url().startsWith(interceptUrl))
  const waitForModelResponse = () =>
    page.waitForResponse((r) => r.url().startsWith(interceptUrl))

  return {interceptUrl, waitForModelRequest, waitForModelResponse}
}


/**
 * Wait for model to be ready after loading
 * Playwright equivalent of cypress/support/models.js waitForModelReady
 *
 * @param page Playwright page object
 */
export async function waitForModelReady(page: Page) {
  // Wait for model ready attribute on dropzone (matching working tests)
  await page.pause()
  const dropzone = page.getByTestId('cadview-dropzone')
  // await page.pause()
  const MODEL_READY_TIMEOUT = 15000
  await expect(dropzone).toHaveAttribute('data-model-ready', 'true', {timeout: MODEL_READY_TIMEOUT})
  // Wait for animations to settle (equivalent to cy.wait(animWaitTimeMs))
  const animWaitTimeMs = 1000
  await page.waitForTimeout(animWaitTimeMs)
}
