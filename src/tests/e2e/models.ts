import {Page, expect} from '@playwright/test'
import {readFile} from 'fs/promises'
import {join} from 'path'


/**
 * Set up virtual path intercept for model loading
 * Uses Promise.all pattern like routes.spec.ts for proper synchronization
 *
 * After the rawgit.bldrs.dev proxy was retired, the SPA dereferences
 * GitHub-hosted files via the Contents API and then fetches the resulting
 * `download_url` directly from raw.githubusercontent.com. This helper
 * intercepts both calls and serves the fixture file for the download.
 *
 * @param page Playwright page object
 * @param path Virtual path to intercept (e.g. '/share/v/gh/<owner>/<repo>/<ref>/<filePath>')
 * @param fixturePath Path to fixture file under src/tests/fixtures
 * @return Object with intercept helpers and navigation function
 */
export async function setupVirtualPathIntercept(
  page: Page,
  path: string,
  fixturePath: string,
) {
  const sharePrefix = '/share/v/gh'
  if (!path.startsWith(sharePrefix)) {
    throw new Error(`Path must start with ${sharePrefix}`)
  }

  const fixturesDir = 'src/tests/fixtures'
  const ghPath = path.substring(sharePrefix.length) // /<owner>/<repo>/<ref>/<filePath>
  const ghParts = ghPath.replace(/^\//, '').split('/')
  const ghPartsMin = 4
  if (ghParts.length < ghPartsMin) {
    throw new Error(`Path must include owner/repo/ref/filePath: ${path}`)
  }
  const [owner, repo, ref, ...filePathParts] = ghParts
  const filePath = filePathParts.join('/')

  const downloadUrl = `https://raw.githubusercontent.com${ghPath}`
  const escapedFilePath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const contentsApiPattern = new RegExp(
    `^https://api\\.github\\.com(?:\\.[\\w-]+)?/repos/${owner}/${repo}/contents/${escapedFilePath}(?:\\?.*ref=${escapedRef}.*)?$`,
  )
  const downloadUrlPattern = new RegExp(
    `^https://raw\\.githubusercontent\\.com${ghPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\?.*)?$`,
  )

  const fixtureBytesPromise = readFile(join(fixturesDir, fixturePath))

  const HTTP_OK = 200
  await page.route(contentsApiPattern, async (route) => {
    await route.fulfill({
      status: HTTP_OK,
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        name: filePathParts[filePathParts.length - 1],
        path: filePath,
        sha: 'e2etestsha000000000000000000000000000000',
        size: 0,
        url: `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
        html_url: `https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`,
        git_url: `https://api.github.com/repos/${owner}/${repo}/git/blobs/e2etestsha000000000000000000000000000000`,
        download_url: downloadUrl,
        type: 'file',
      }),
    })
  })

  await page.route(downloadUrlPattern, async (route) => {
    const body = await fixtureBytesPromise
    await route.fulfill({
      status: HTTP_OK,
      headers: {'content-type': 'application/octet-stream'},
      body,
    })
  })

  // Return helpers that use Promise.all pattern like routes.spec.ts
  const navigateAndWaitForModel = async () => {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().startsWith(downloadUrl)),
      page.goto(path, {waitUntil: 'domcontentloaded'}),
    ])
    return response
  }

  return {
    interceptUrl: downloadUrl,
    navigateAndWaitForModel,
    waitForModelRequest: () => page.waitForRequest((r) => r.url().startsWith(downloadUrl)),
    waitForModelResponse: () => page.waitForResponse((r) => r.url().startsWith(downloadUrl)),
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
