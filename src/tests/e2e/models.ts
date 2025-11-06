import {Page, expect} from '@playwright/test'
import {readFile} from 'fs/promises'
import {join} from 'path'


/**
 * Set up virtual path intercept for model loading
 * Uses Promise.all pattern like routes.spec.ts for proper synchronization
 *
 * @param page Playwright page object
 * @param path Virtual path to intercept
 * @param fixturePath Path to fixture file
 * @return Object with intercept helpers and navigation function
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

  const fixturesDir = 'src/tests/fixtures'
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

  // Return helpers that use Promise.all pattern like routes.spec.ts
  const navigateAndWaitForModel = async () => {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().startsWith(interceptUrl)),
      page.goto(path, {waitUntil: 'domcontentloaded'}),
    ])
    return response
  }

  return {
    interceptUrl,
    navigateAndWaitForModel,
    // Legacy helpers for backwards compatibility
    waitForModelRequest: () => page.waitForRequest((r) => r.url().startsWith(interceptUrl)),
    waitForModelResponse: () => page.waitForResponse((r) => r.url().startsWith(interceptUrl)),
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
