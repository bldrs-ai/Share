import {Page, expect} from '@playwright/test'
import {readFile} from 'fs/promises'
import {join} from 'path'


/**
 * Set up virtual path intercept for model loading.
 *
 * The mocking strategy depends on the GitHub repo in the URL:
 *
 * - **`bldrs-ai/test-models/*`** — handled end-to-end by the dev server.
 *   Fixtures live under `src/tests/fixtures/github/bldrs-ai/test-models/`
 *   and are copied into `docs/__test_fixtures__/` by `yarn test-flows-build`.
 *   The MSW Contents API handler returns a `download_url` that points at
 *   `/__test_fixtures__/...`, the SPA fetches it, the dev server serves the
 *   real fixture bytes. No `page.route` needed.
 *
 * - **Other repos (cypresstester/test-repo, Swiss-Property-AG/Momentum-Public)**
 *   — fall back to per-test page.route + inline-base64 (the legacy path).
 *   Kept because the existing MSW stubs already work for these and changing
 *   them would invalidate screenshot baselines for tests we're not breaking.
 *
 * The exported signature is unchanged so existing callers don't need updates.
 *
 * @param page Playwright page object
 * @param path Virtual path to intercept (e.g. '/share/v/gh/<owner>/<repo>/<ref>/<filePath>')
 * @param fixturePath Path to fixture file under src/tests/fixtures (ignored for
 *   bldrs-ai/test-models — the URL determines which fixture is served)
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

  const ghPath = path.substring(sharePrefix.length) // /<owner>/<repo>/<ref>/<filePath>
  const ghParts = ghPath.replace(/^\//, '').split('/')
  const ghPartsMin = 4
  if (ghParts.length < ghPartsMin) {
    throw new Error(`Path must include owner/repo/ref/filePath: ${path}`)
  }
  const [owner, repo, ref] = ghParts

  // bldrs-ai/test-models is normally handled by MSW + the dev server
  // (MSW returns the localhost download_url, dev server serves the file).
  // But MSW's service worker can be in transition immediately after a
  // full-page navigation, in which case the Contents API request misses
  // MSW and hits real DNS for the fake-suffix test host (.pw). Register a
  // defensive context-level page.route as a fallback: if MSW intercepts
  // first this never fires; if MSW misses, page.route fulfills with the
  // same mock shape MSW would have produced.
  if (owner === 'bldrs-ai' && repo === 'test-models') {
    const filePathParts = ghParts.slice(3)
    const filePath = filePathParts.join('/')
    const fixtureUrl = `/__test_fixtures__${ghPath}`
    const HTTP_OK = 200
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const filePathInRegex = escapeRegex(filePath).replace(/\//g, '(?:/|%2F)')
    const contentsApiPattern = new RegExp(
      `^https://api\\.github\\.com(?:\\.[\\w-]+)?` +
      `/repos/${owner}/${repo}/contents/${filePathInRegex}` +
      `\\?.*ref=${escapeRegex(ref)}.*$`,
    )
    await page.context().route(contentsApiPattern, async (route) => {
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
          download_url: fixtureUrl,
          type: 'file',
        }),
      })
    })

    const navigateAndWaitForModel = async () => {
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith(fixtureUrl)),
        page.goto(path, {waitUntil: 'domcontentloaded'}),
      ])
      return response
    }
    return {
      interceptUrl: fixtureUrl,
      navigateAndWaitForModel,
      waitForModelRequest: () => page.waitForRequest((r) => r.url().endsWith(fixtureUrl)),
      waitForModelResponse: () => page.waitForResponse((r) => r.url().endsWith(fixtureUrl)),
    }
  }

  // Legacy per-test page.route path for the cypresstester / Momentum-Public
  // cases. These hit MSW's existing inline-base64 stubs first; the page.route
  // here intercepts the resulting raw.githubusercontent.com / media URL with
  // the actual fixture bytes.
  const fixturesDir = 'src/tests/fixtures'
  const filePathParts = ghParts.slice(3)
  const filePath = filePathParts.join('/')

  const fixtureBytes = await readFile(join(fixturesDir, fixturePath))
  const downloadUrl = `https://raw.githubusercontent.com${ghPath}`
  const HTTP_OK = 200
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedFilePath = escapeRegex(filePath)

  const filePathInRegex = escapedFilePath.replace(/\//g, '(?:/|%2F)')
  const contentsApiPattern = new RegExp(
    `^https://api\\.github\\.com(?:\\.[\\w-]+)?` +
    `/repos/${owner}/${repo}/contents/${filePathInRegex}` +
    `\\?.*ref=${escapeRegex(ref)}.*$`,
  )
  await page.context().route(contentsApiPattern, async (route) => {
    await route.fulfill({
      status: HTTP_OK,
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        name: filePathParts[filePathParts.length - 1],
        path: filePath,
        sha: 'e2etestsha000000000000000000000000000000',
        size: fixtureBytes.length,
        url: `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
        html_url: `https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`,
        git_url: `https://api.github.com/repos/${owner}/${repo}/git/blobs/e2etestsha000000000000000000000000000000`,
        download_url: downloadUrl,
        type: 'file',
        content: fixtureBytes.toString('base64'),
        encoding: 'base64',
      }),
    })
  })

  await page.context().route(`https://raw.githubusercontent.com${ghPath}`, async (route) => {
    await route.fulfill({
      status: HTTP_OK,
      headers: {'content-type': 'application/octet-stream'},
      body: fixtureBytes,
    })
  })

  await page.context().route(`https://media.githubusercontent.com/media${ghPath}`, async (route) => {
    await route.fulfill({
      status: HTTP_OK,
      headers: {'content-type': 'application/octet-stream'},
      body: fixtureBytes,
    })
  })

  const navigateAndWaitForModel = async () => {
    const [response] = await Promise.all([
      page.waitForResponse((r) => contentsApiPattern.test(r.url())),
      page.goto(path, {waitUntil: 'domcontentloaded'}),
    ])
    return response
  }

  return {
    interceptUrl: downloadUrl,
    navigateAndWaitForModel,
    waitForModelRequest: () => page.waitForRequest((r) => contentsApiPattern.test(r.url())),
    waitForModelResponse: () => page.waitForResponse((r) => contentsApiPattern.test(r.url())),
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
