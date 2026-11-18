import {Page, expect} from '@playwright/test'
import {readFile} from 'fs/promises'
import {join} from 'path'
import {fixtureBlobSha} from '../../__mocks__/fixtureBlobSha'
import {MOCK_COMMITS} from '../../net/github/Commits.fixture'
import {dismissLoadGrace} from './utils'


/*
 * Both GitHub API hosts the app can call, whatever suffix the build gives
 * them (`.msw` locally, `.pw` in CI; tools/esbuild/vars.cypress.js and
 * test-flows.yml): the unauthenticated `api.github.com` and the signed-in
 * proxy `git.bldrs.dev/p/gh`. MSW mocks both, but its fallbacks below must
 * match both too: a spec that signs in first (directLinkSoftGate.spec.ts)
 * reaches GitHub through the proxy, and a fallback that only knew
 * `api.github.com` let those requests through to real DNS whenever MSW was
 * not yet in control after a full-page navigation.
 */
const GITHUB_API_HOSTS = String.raw`(?:api\.github\.com|git\.bldrs\.dev(?:\.[\w-]+)?/p/gh)(?:\.[\w-]+)?`


/**
 * Fallback for the Commits API the loader asks before the Contents API, for
 * the file's latest sha. Same race as the Contents fallback: never fires
 * while MSW intercepts first.
 *
 * MSW's own commits for a success repo (__mocks__/api-handlers-github.ts,
 * `/repos/:owner/:repo/commits`), trimmed to the fields the app reads: `sha`
 * (Commits.js#getLatestCommitHash) and `commit.{author, committer, message}`
 * (useVersions, useGithubLastModified). The rest of `MOCK_COMMITS` embeds URLs
 * built from an env var at module load, which in this (Playwright) process
 * differs from the one MSW's bundle was built with, so it is left out rather
 * than served wrong. Registered for `bldrs-ai/test-models` only: a success repo, so a
 * 200 is what MSW would have answered — never for an error-flow repo, whose
 * 404 a fallback must not turn into a pass.
 *
 * @param page
 * @param owner
 * @param repo
 */
async function routeCommitsFallback(page: Page, owner: string, repo: string) {
  const HTTP_OK = 200
  await page.context().route(
    new RegExp(`^https://${GITHUB_API_HOSTS}/repos/${owner}/${repo}/commits(?:\\?.*)?$`),
    async (route) => {
      await route.fulfill({
        status: HTTP_OK,
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(MOCK_COMMITS.data.map(({sha, commit}) => ({
          sha,
          commit: {author: commit.author, committer: commit.committer, message: commit.message},
        }))),
      })
    },
  )
}


/**
 * Set up virtual path intercept for model loading.
 *
 * The mocking strategy depends on the GitHub repo in the URL:
 *
 * - **`bldrs-ai/test-models/*`** — handled end-to-end by the dev server.
 *   Fixtures live under `src/tests/fixtures/github/bldrs-ai/test-models/`
 *   and are copied into `docs/__test_fixtures__/` by `bun run test-flows-build`.
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
      `^https://${GITHUB_API_HOSTS}` +
      `/repos/${owner}/${repo}/contents/${filePathInRegex}` +
      `\\?.*ref=${escapeRegex(ref)}.*$`,
    )
    await routeCommitsFallback(page, owner, repo)
    await page.context().route(contentsApiPattern, async (route) => {
      await route.fulfill({
        status: HTTP_OK,
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          name: filePathParts[filePathParts.length - 1],
          path: filePath,
          // The MSW handler's per-path sha (fixtureBlobSha.ts says why).
          sha: fixtureBlobSha(filePath),
          size: 0,
          url: `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
          html_url: `https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`,
          git_url: `https://api.github.com/repos/${owner}/${repo}/git/blobs/${fixtureBlobSha(filePath)}`,
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


// Enough for every fixture-sized model in this repo. Deliberately not
// generous: a spec that hangs on a broken load should fail fast. Callers
// that legitimately need longer — a measurement run against a
// hundred-megabyte model, or one under CPU throttling — pass their own.
const MODEL_READY_TIMEOUT = 15000


/**
 * Wait for model to be ready after loading
 * Playwright equivalent of cypress/support/models.js waitForModelReady
 *
 * `onReady` runs at the ready transition itself, *before* the settle wait
 * and grace dismissal below. It exists for the load-measurement harness,
 * whose CPU window has to close where its wall-clock denominator closes:
 * sampling after this function returns would put the fixed second (plus the
 * dismissal) in the numerator only, inflating every CPU-versus-wall ratio.
 * Every other caller omits it and is unaffected.
 *
 * @param page Playwright page object
 * @param timeoutMs How long to wait for `data-model-ready`
 * @param onReady Awaited the moment `data-model-ready` flips, before settling
 */
export async function waitForModelReady(
  page: Page,
  timeoutMs: number = MODEL_READY_TIMEOUT,
  // Explicitly defaulted rather than `onReady?:` so it counts as a default
  // parameter — eslint's default-param-last rejects an optional one after
  // `timeoutMs`'s default.
  onReady: (() => Promise<void>) | undefined = undefined,
) {
  // Wait for model ready attribute on dropzone (matching working tests)
  const dropzone = page.getByTestId('cadview-dropzone')
  await expect(dropzone).toHaveAttribute('data-model-ready', 'true', {timeout: timeoutMs})
  if (onReady !== undefined) {
    await onReady()
  }
  // Wait for animations to settle (equivalent to cy.wait(animWaitTimeMs))
  const animWaitTimeMs = 1000
  await page.waitForTimeout(animWaitTimeMs)
  // Drop the transient post-load grace snackbar so it doesn't land in
  // screenshots (conway #301) — see dismissLoadGrace.
  await dismissLoadGrace(page)
}
