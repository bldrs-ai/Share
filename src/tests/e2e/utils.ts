import {BrowserContext, Page, Request, Response, Route, expect} from '@playwright/test'
import {readFile} from 'fs/promises'
import {resolve} from 'path'
import {isBlockedRealNetworkHost} from './networkGuard'


/**
 * Log network calls to the console
 *
 * @param page - Playwright page object
 */
export function logNetworkCalls({page}: {page: Page}) {
  const skipAdAndAnalyticsRequests = (req: Request) => {
    const hostname = new URL(req.url()).hostname
    if (hostname.endsWith('googletagmanager.com') ||
        hostname.endsWith('google-analytics.com') ||
        hostname.endsWith('googlesyndication.com') ||
        hostname.endsWith('doubleclick.net')) {
      return true
    }
    return false
  }

  page.on('request', (req: Request) => {
    if (skipAdAndAnalyticsRequests(req)) {
      return
    }
    console.warn(`➡️  ${req.method()} ${req.url()}`)
  })

  page.on('response', (res) => {
    if (skipAdAndAnalyticsRequests(res.request() as Request)) {
      return
    }
    const status = res.status()
    const ok = res.ok() ? '✅' : '❌'
    console.warn(`${ok} ${status} ${res.url()}`)
  })

  page.on('requestfailed', (req) => {
    console.warn(`❌ FAILED ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`)
  })
}


/** Clear browser storage and cookies. */
export async function clearState(context: BrowserContext) {
  await context.clearCookies()
  await context.clearPermissions()
}


/**
 * Clear the page's OPFS root directory. Belt-and-suspenders cleanup
 * for tests: Playwright's `fullyParallel: true` config already gives
 * each test a fresh `BrowserContext` with its own OPFS slot, so leaks
 * across tests shouldn't happen — but a leftover entry from a
 * previous run (browser-process reuse, a context that was
 * unexpectedly pooled) would silently produce a cache HIT on a test
 * that expects MISS. Clearing here makes the assertion deterministic.
 *
 * Safe to call before any navigation has happened: the iterator is a
 * no-op on an empty root. `getDirectory()` is the OPFS entry point;
 * `removeEntry({recursive: true})` deletes a subtree.
 *
 * Best-effort: if the page has no origin yet (e.g., called before any
 * `page.goto`), `navigator.storage` may throw — the catch swallows
 * the error so test setup keeps moving.
 *
 * @param page - Playwright page object
 */
export async function clearOpfs(page: Page) {
  await page.evaluate(async () => {
    try {
      // OPFS supports `for await` iteration over directory entries;
      // collect first, then remove, so we don't mutate the iterator
      // mid-walk (some Chromium versions error on concurrent
      // mutation). `as any` because lib.dom.d.ts in our TS version
      // doesn't yet type the async iterator + `recursive` option on
      // FileSystemDirectoryHandle — both are stage-3 and ship in
      // Chromium.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const root: any = await navigator.storage.getDirectory()
      const entries: string[] = []
      for await (const [name] of root.entries()) {
        entries.push(name)
      }
      for (const name of entries) {
        await root.removeEntry(name, {recursive: true})
      }
    } catch (e) {
      // No origin yet (about:blank), OPFS unsupported in the test
      // browser, quota error — none should block test setup.
      console.warn('clearOpfs: skipped:', e)
    }
  })
}


/**
 * Block real-internet network calls during tests.
 *
 * Tests must serve all traffic locally — fixtures, MSW handlers, page.route
 * fulfillments. A request that escapes to a real host (e.g. the real
 * raw.githubusercontent.com) is a bug, not a known limitation: it makes
 * tests non-hermetic and can paper over broken intercepts. This handler
 * aborts any request whose hostname matches a known real-internet host so
 * the leak fails loudly instead of silently succeeding.
 *
 * Allowlisted (handled by MSW or page.route, not blocked here): localhost,
 * 127.0.0.1, and any host whose hostname ends with one of the test-fake
 * suffixes (.msw, .pw, .jest, .cypress).
 *
 * `allowHosts` names hosts the caller *deliberately* asked for and must not
 * be blocked — the load-measurement harness pointed at a corpus model on
 * raw.githubusercontent.com, for instance. Without it that request is
 * aborted by this guard and the run dies as a model-ready timeout, which
 * reads like a slow model rather than a blocked fetch. The allow is an
 * exact host match; everything else stays blocked (see
 * {@link isBlockedRealNetworkHost}).
 *
 * @param context - Playwright browser context
 * @param allowHosts - hosts the caller deliberately requested, exact match
 */
export async function blockExternalNetwork(context: BrowserContext, allowHosts: string[] = []) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    const hostname = url.hostname.toLowerCase()
    if (isBlockedRealNetworkHost(hostname, allowHosts)) {
      console.error(`Blocked real-network request from test: ${route.request().method()} ${url}`)
      await route.abort('blockedbyclient')
      return
    }
    await route.fallback()
  })
}


/**
 * Setup homepage intercepts and navigate to root path
 *
 * @param page - Playwright page object
 * @param allowHosts - real hosts this test deliberately needs, exact match;
 *   defaults to none, which is what every hermetic spec wants
 */
export async function homepageSetup(page: Page, allowHosts: string[] = []) {
  // Register the real-network guard FIRST so it sits at the bottom of the
  // route stack: fixture-specific routes registered later will match first
  // and short-circuit; only requests no test handler claimed reach this
  // guard.
  await blockExternalNetwork(page.context(), allowHosts)
  // The next two steps are necessary to avoid font synthesis issues in GitHub Actions.
  // Wait for fonts to load
  /*
  await page.evaluate(async () => await (document).fonts?.ready)
  const ok = await page.evaluate(() => document.fonts?.check('16px Roboto'))
  expect(ok).toBeTruthy()
  // Disable font synthesis
  */
  await page.addStyleTag({content: `
    html, body {
      font-synthesis-weight: none;
      font-synthesis-style: none;
    }
  `})
  await clearState(page.context())
}


/**
 * Set cookie indicating user has visited before
 *
 * @param context - Playwright browser context
 */
export async function setIsReturningUser(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'isFirstTime',
      value: '1',
      domain: 'localhost',
      path: '/',
    },
  ])
}


/**
 * Visit root path. This will trigger an autoload to /share/v/p/index.ifc
 * Uses Promise.all to coordinate navigation with response waiting
 * The flow: / -> /share/v/p/index.ifc (bounce) -> request for index.ifc file
 *
 * @param page - Playwright page object
 */
export async function visitHomepage(page: Page) {
  const response = await page.goto('/', {waitUntil: 'domcontentloaded'})
  expect(response?.status()).toBe(HTTP_OK)
}


/**
 * Sets state for returning user and visit homepage
 */
export async function returningUserVisitsHomepage(page: Page) {
  await setIsReturningUser(page.context())
  await visitHomepage(page)
}


/**
 * Same as returningUserVisitsHomepage, but wait for model too
 *
 * @param search Optional query string (e.g. '?feature=quotas') appended to the
 *   model URL so the SPA boots with feature flags active.
 */
export async function returningUserVisitsHomepageWaitForModel(page: Page, search = '') {
  await setIsReturningUser(page.context())
  await visitHomepageWaitForModel(page, search)
}


/**
 * Assumes other setup, then visit homepage and wait for model
 *
 * @param search Optional query string (e.g. '?feature=quotas') appended to the
 *   model URL so the SPA boots with feature flags active.
 */
export async function visitHomepageWaitForModel(page: Page, search = '') {
  await Promise.all([
    // await page.waitForURL('/index.ifc', {timeout: 10_000}), // ensure the bounce happened
    page.waitForResponse(async (response: Response) => {
      const url = new URL(response.url())
      if (url.pathname === '/index.ifc' && response.status() === HTTP_OK) {
        await waitForModel(page)
        return true
      }
      return false
    }),
    page.goto(`/share/v/p/index.ifc${search}`, {waitUntil: 'domcontentloaded'}),
  ])
  // MSW registers and activates its service worker during the first
  // navigation. Wait for it to be the page's active controller before
  // any subsequent test navigation makes a fetch — otherwise requests
  // to the fake-suffix test hosts (api.github.com.pw etc.) miss MSW
  // and fail real DNS resolution.
  await waitForServiceWorker(page)
}


/**
 * Waits until a service worker is registered AND controlling the current
 * page. Required before tests can rely on MSW's interception.
 *
 * @param page - Playwright page object
 */
export async function waitForServiceWorker(page: Page) {
  const SW_READY_TIMEOUT = 10000
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    {timeout: SW_READY_TIMEOUT},
  )
}


/**
 * Waits for a 3D model to load and become visible within the viewer.
 *
 * @param page - Playwright page object
 */
export async function waitForModel(page: Page) {
  // Wait for viewer container and canvas
  const viewerContainer = page.locator('#viewer-container')
  await expect(viewerContainer).toBeVisible()

  const canvas = viewerContainer.locator('canvas')
  await expect(canvas).toBeVisible()

  // Wait for model ready attribute on dropzone (matching working homepage test)
  const dropzone = page.getByTestId('cadview-dropzone')
  await expect(dropzone).toHaveAttribute('data-model-ready', 'true', {timeout: 30_000})
  await dismissLoadGrace(page)
}


/**
 * Dismiss the post-load "grace" snackbar (conway #301). After every load the
 * snackbar lingers ~5s on "Model Loaded. Total …" before handing off to the
 * "i" report control (see AlertDialogAndSnackbar). That transient toast would
 * otherwise pollute steady-state screenshots and shadow the shared snackbar
 * that the snackMessage tests assert on — so tests that have waited for the
 * model clear it and assert the settled page. Real users still see it. No-op
 * when the store isn't exposed on window (non-test builds).
 *
 * @param page - Playwright page object
 */
export async function dismissLoadGrace(page: Page) {
  await page.evaluate(() => {
    const withStore = window as unknown as {
      store?: {getState: () => {setLoadResult?: (result: unknown) => void}}
    }
    withStore.store?.getState().setLoadResult?.(null)
  })
}


/**
 * Stop the viewer painting frames, for tests that drive UI over a loaded
 * model but never assert on the canvas.
 *
 * The render loop is always-on: the fork's rAF loop calls the closure
 * installed via `ThreeContext.setRenderUpdate`, which drives an
 * `EffectComposer` (DESIGN.md §"Render loop & perf monitor"). Headless CI
 * has no GPU, so that composer runs through SwiftShader and pins the page's
 * main thread even when nothing on screen is moving. Playwright polls
 * actionability on rAF, so the whole harness inherits the frame time.
 * Measured on a 4-core headless runner: rAF every ~74ms and a single click
 * ~978ms while painting, versus ~16ms and ~139ms once paused (#1759).
 *
 * Replacing the update closure leaves the rAF loop itself running, so the
 * page keeps ticking normally — it just stops rendering, and the canvas
 * holds its last painted frame. That makes this safe for dialog/panel flows
 * and WRONG for anything that screenshots the scene, moves the camera, or
 * asserts on highlighting. There is no resume: call it after the model is
 * ready and treat the scene as frozen for the rest of the test.
 *
 * Throws rather than degrading if the seam moves. A silent no-op here would
 * quietly restore the slow path and show up much later as unexplained
 * timeouts, which is exactly the failure #1759 spent two runs diagnosing.
 *
 * @param page - Playwright page object
 */
export async function pauseViewerRendering(page: Page) {
  const paused = await page.evaluate(() => {
    // `window.useStore` is exposed by BaseRoutes under the test client id
    // (see the OAUTH_2_CLIENT_ID guard there); `viewer` is set by CadView
    // once the viewer is initialized.
    const withStore = window as unknown as {
      useStore?: {getState: () => {viewer?: {context?: {setRenderUpdate?: (fn: () => void) => void}}}}
    }
    const context = withStore.useStore?.getState().viewer?.context
    if (typeof context?.setRenderUpdate !== 'function') {
      return false
    }
    // Paused deliberately; see this helper's docstring.
    context.setRenderUpdate(() => undefined)
    return true
  })
  expect(paused, 'pauseViewerRendering: no render seam at window.useStore.getState().viewer.context').toBe(true)
}


/**
 * Helper to register an intercept and navigate to a route
 *
 * @param page - Playwright page object
 * @param intereceptPattern - Pattern to match for page.route()
 * @param responseUrlStr - URL string to match in waitForResponse()
 * @param fixtureFilename - Fixture file name (relative to src/tests/fixtures/)
 * @param gotoPath - Path to navigate to
 * @return The intercepted response
 */
export async function registerIntercept({
  page,
  intereceptPattern,
  responseUrlStr,
  fixtureFilename,
  gotoPath,
}: {
  page: Page,
  intereceptPattern: RegExp,
  responseUrlStr: string,
  fixtureFilename: string,
  gotoPath: string,
}): Promise<Response> {
  const fixtureBuffer = await readFile(`${FIXTURES_DIR}/${fixtureFilename}`)
  await page.route(intereceptPattern, (route: Route) => {
    route.fulfill({
      status: HTTP_OK,
      body: fixtureBuffer,
      contentType: 'application/octet-stream',
    })
  })

  const [response] = await Promise.all([
    page.waitForResponse((r: Response) => r.url().startsWith(responseUrlStr)),
    page.goto(gotoPath),
  ])

  return response
}

const FIXTURES_DIR = resolve(process.cwd(), 'src/tests/fixtures')


// Auth0 helpers

/**
 * Enhanced homepage setup with authentication intercepts
 */
export async function homepageSetupWithAuth(page: Page) {
  await homepageSetup(page)
  await setupAuthenticationIntercepts(page)
}


/**
 * Sets up Playwright route intercepts for handling authentication.
 * Playwright equivalent of setupAuthenticationIntercepts from Cypress.
 *
 * The connection param controls the identity claim emitted on the JWT. Keep
 * this aligned with the `connection` passed to auth0Login — the intercept
 * also reads it from the /authorize query string so silent refresh after
 * reload works without needing the caller to repeat it.
 *
 * @param page Playwright page object
 * @param options Options
 * @param options.connection Auth0 connection — determines the identities claim
 */
export async function setupAuthenticationIntercepts(
  page: Page,
  {connection = 'github'}: {connection?: 'github' | 'google'} = {},
) {
  const context = page.context()

  // Route patterns: catch both HTTP(s) and any host
  const AUTHORIZE = /\/authorize(\?|$)/
  const TOKEN = /\/oauth\/token(\?|$)/

  // Unroute existing handlers first to avoid conflicts
  await context.unroute(AUTHORIZE)
  await context.unroute(TOKEN)

  // Seed contextState with the caller-declared connection. The /authorize
  // handler below may override it with whatever Auth0 actually sends on the
  // query string (e.g. a google-oauth2 silent refresh after login).
  const initial = contextState.get(context) ?? {port: DEFAULT_PORT, nonce: '', connection}
  initial.connection = connection
  contextState.set(context, initial)

  // Intercept the /authorize request
  await context.route(AUTHORIZE, async (route: Route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams

    // Extract the 'state' and 'nonce' parameters
    const state = query.get('state') || ''
    const nonce = query.get('nonce') || ''
    const queryConnection = query.get('connection')

    const cs = contextState.get(context) ?? {port: DEFAULT_PORT, nonce: '', connection}
    cs.nonce = nonce
    if (queryConnection === 'github' || queryConnection === 'google-oauth2') {
      cs.connection = queryConnection === 'google-oauth2' ? 'google' : 'github'
    }
    contextState.set(context, cs)

    const targetOrigin = getOrigin(getPort(context))
    const FAKE_CODE = 'MMHHFcQ1bA-CrsFi6ctzt4wLc-aIljuJbdUyijNOdmtbE'

    const body = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Authorization Response</title></head>
<body>
<script>
(function(window){
  var targetOrigin = "${targetOrigin}";
  var authorizationResponse = {
    type: "authorization_response",
    response: { "code": "${FAKE_CODE}", "state": ${JSON.stringify(state)} }
  };
  var mainWin = window.opener ? window.opener : window.parent;
  // Auth0 SPA SDK listens for this message on the opener
  mainWin.postMessage(authorizationResponse, targetOrigin);
})(this);
</script>
</body>
</html>`

    // Send back modified response
    await route.fulfill({
      status: HTTP_OK,
      contentType: 'text/html; charset=utf-8',
      headers: {
        'cache-control': 'no-store',
      },
      body,
    })
  })

  // Intercept the /oauth/token request
  await context.route(TOKEN, async (route: Route) => {
    // Update the iat and exp values
    const SECONDS_PER_DAY = 86400
    const MILLIS_PER_SECOND = 1000
    const now = Math.floor(Date.now() / MILLIS_PER_SECOND)
    const exp = now + SECONDS_PER_DAY // Add 24 hours

    const {nonce = '', connection: cxn = connection} = contextState.get(context) ?? {}

    const providerKey = cxn === 'google' ? 'google-oauth2' : 'github'
    const sub = `${providerKey}|11111111`
    const identities = [{connection: providerKey, provider: providerKey, user_id: '11111111', isSocial: true}]

    const payload = {
      'nickname': 'cypresstester',
      'name': 'cypresstest@bldrs.ai',
      'picture': 'https://avatars.githubusercontent.com/u/17447690?v=4',
      'updated_at': new Date().toISOString(),
      'email': 'cypresstest@bldrs.ai',
      'email_verified': true,
      'iss': 'https://bldrs.us.auth0.com.msw/',
      'aud': 'cypresstestaudience',
      'iat': now,
      exp,
      sub,
      'sid': 'cypresssession-abcdef',
      nonce, // must match nonce from /authorize request
      // Custom claims BaseRoutes decodes to decide GitHub vs non-GitHub auth.
      // Empty app_metadata skips the reauth modal branches.
      'https://bldrs.ai/app_metadata': {subscriptionStatus: null},
      'https://bldrs.ai/identities': identities,
      identities,
    }

    // Fake JWT: header.payload.signature (header + signature can be anything)
    const header = {alg: 'RS256', typ: 'JWT', kid: 'test-kid'}
    const idToken = `${base64url(header)}.${base64url(payload)}.signature`

    // BaseRoutes decodes the access_token as a JWT, so emit a JWT there too.
    const accessToken = `${base64url(header)}.${base64url(payload)}.signature`

    const response = {
      access_token: accessToken,
      id_token: idToken,
      scope: 'openid profile email offline_access',
      expires_in: SECONDS_PER_DAY,
      token_type: 'Bearer',
    }

    // Send back modified response
    await route.fulfill({
      status: HTTP_OK,
      contentType: 'application/json; charset=utf-8',
      headers: {
        'access-control-allow-origin': getOrigin(getPort(context)),
        'access-control-allow-credentials': 'true',
        'cache-control': 'no-store',
      },
      body: JSON.stringify(response),
    })
  })
}

// Context-specific state to avoid concurrency issues
const contextState = new WeakMap<BrowserContext, {port: number, nonce: string, connection: 'github' | 'google'}>()


/**
 * Performs a simulated login using Auth0 by interacting with UI elements.
 * Note: Requires authentication intercepts to be set up first.
 */
export async function auth0Login(page: Page, connection: 'github' | 'google' = 'github') {
  await expect(page.getByTestId('AccountBoxOutlinedIcon')).toBeVisible()
  await page.getByTestId('control-button-profile').click()
  await page.getByTestId('menu-open-login-dialog').click()
  if (connection === 'github') {
    await page.getByTestId('login-with-github').click()
  } else {
    await page.getByTestId('login-with-google').click()
  }
  await expect(page.getByTestId('control-button-profile-icon-authenticated')).toBeVisible()
}


// Helpers.  No exports below here.
/**
 * Retrieves the current value of the context-specific port variable
 *
 * @param context Browser context
 * @return Port number
 */
function getPort(context: BrowserContext): number {
  return contextState.get(context)?.port || DEFAULT_PORT
}


const getOrigin = (port: number) => `http://127.0.0.1:${port}`


/**
 * URL-safe base64 without padding
 *
 * @param obj Object to encode
 * @return URL-safe base64 string
 */
function base64url(obj: unknown): string {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj)
  const b64 = Buffer.from(json, 'utf8').toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}


const DEFAULT_PORT = 8080
const HTTP_OK = 200
export const LONG_TEST_TIMEOUT_SECONDS = 60_000
