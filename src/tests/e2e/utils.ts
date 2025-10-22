import {BrowserContext, Page, Response, Route, expect} from '@playwright/test'
import {readFile} from 'fs/promises'
import path from 'path'


// Context-specific state to avoid concurrency issues
const contextState = new WeakMap<BrowserContext, {port: number, nonce: string}>()


/**
 * Clear browser storage and cookies
 */
export async function clearState(context: BrowserContext) {
  await context.clearCookies()
  await context.clearPermissions()
}


// const FIXTURES_DIR = join(__dirname, '..', '..', '..', 'cypress', 'fixtures')
const FIXTURES_DIR = path.resolve(process.cwd(), 'cypress/fixtures')


/**
 * Helper to register an intercept and navigate to a route
 *
 * @param page - Playwright page object
 * @param intereceptPattern - Pattern to match for page.route()
 * @param responseUrlStr - URL string to match in waitForResponse()
 * @param fixtureFilename - Fixture file name (relative to cypress/fixtures/)
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


/**
 * Intercept load of index.ifc to serve fixture data.
 * Playwright equivalent of cy.intercept('GET', '/index.ifc', {fixture: 'index.ifc'})
 */
export async function interceptIndex(page: Page) {
  // Unroute any existing handlers first to avoid conflicts
  await page.unroute('**/index.ifc')

  await page.route('**/index.ifc', async (route) => {
    try {
      const fixtureBuffer = await readFile(`${FIXTURES_DIR}/index.ifc`)
      await route.fulfill({
        status: HTTP_OK,
        contentType: 'application/octet-stream',
        body: fixtureBuffer,
      })
    } catch (error) {
      console.warn('Failed to load index.ifc fixture:', error)
      // Fallback to continue with original request
      await route.continue()
    }
  })
}


/**
 * Intercept load of virtual project path to serve 404 bounce page.
 * Playwright equivalent of cy.intercept('GET', '/share/v/p/index.ifc', {fixture: '404.html'})
 */
export async function interceptBounce(page: Page) {
  const patterns = [
    '**/share/v/p/index.ifc',
    '**/share/v/p/index.ifc/*',
    '**/share/v/p/index.ifc?*',
  ]

  // Unroute existing handlers first to avoid conflicts
  for (const pattern of patterns) {
    await page.unroute(pattern)
  }

  for (const pattern of patterns) {
    await page.route(pattern, async (route) => {
      try {
        const fixtureBuffer = await readFile(`${FIXTURES_DIR}/404.html`)
        await route.fulfill({
          status: 404,
          contentType: 'text/html; charset=utf-8',
          body: fixtureBuffer,
        })
      } catch (error) {
        console.warn('Failed to load 404.html fixture:', error)
        // Fallback to actual 404
        await route.fulfill({
          status: 404,
          contentType: 'text/html; charset=utf-8',
          body: '<html><body><h1>404 Not Found</h1></body></html>',
        })
      }
    })
  }
}


/**
 * Setup initial homepage intercepts
 */
export async function interceptInitialLoads(page: Page) {
  await interceptIndex(page)
  await interceptBounce(page)
}


/**
 * Setup homepage intercepts and navigate to root path
 *
 * @param page - Playwright page object
 */
export async function homepageSetup(page: Page) {
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
 */
export async function returningUserVisitsHomepageWaitForModel(page: Page) {
  await setIsReturningUser(page.context())
  await visitHomepageWaitForModel(page)
}


/**
 * Assumes other setup, then visit homepage and wait for model
 */
export async function visitHomepageWaitForModel(page: Page) {
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
    page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'}),
  ])
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
}


/**
 * Enhanced homepage setup with authentication intercepts
 */
export async function homepageSetupWithAuth(page: Page) {
  await homepageSetup(page)
  await setupAuthenticationIntercepts(page)
}


/**
 * Wait for network requests to complete (useful for complex async operations)
 */
export async function waitForNetworkIdle(page: Page, timeout = 5000) {
  await page.waitForLoadState('networkidle', {timeout})
}


/**
 * Helper to wait for any element to be stable (not moving/changing)
 */
export async function waitForElementStable(page: Page, selector: string, timeout = 2000) {
  const element = page.locator(selector)
  await expect(element).toBeVisible()

  // Wait a bit for any animations/transitions to complete
  await page.waitForTimeout(timeout)
}


/**
 * Comprehensive model loading verification with network checks
 * Uses Promise.all pattern like routes.spec.ts for proper synchronization
 *
 * @param page Playwright page object
 * @param gotoPath Path to navigate to (optional, if not provided just waits for model)
 * @return The intercepted response if gotoPath provided
 */
export async function waitForModelWithNetworkCheck(page: Page, gotoPath?: string) {
  if (gotoPath) {
    // Use Promise.all pattern to coordinate navigation and response
    const [response] = await Promise.all([
      page.waitForResponse(
        (rsp) => rsp.url().includes('index.ifc') && rsp.status() === HTTP_OK,
        {timeout: MODEL_LOAD_TIMEOUT},
      ),
      page.goto(gotoPath, {waitUntil: 'domcontentloaded'}),
    ])
    await waitForModel(page)
    return response
  } else {
    // Just wait for response and DOM readiness
    const modelLoadPromise = page.waitForResponse(
      (response) => response.url().includes('index.ifc') && response.status() === HTTP_OK,
      {timeout: MODEL_LOAD_TIMEOUT},
    )
    await Promise.all([
      modelLoadPromise,
      waitForModel(page),
    ])
  }
}


/**
 * Performs a simulated login using Auth0 by interacting with UI elements.
 * Note: Requires authentication intercepts to be set up first.
 */
export async function auth0Login(page: Page, connection: 'github' | 'google' = 'github') {
  await page.getByTestId('control-button-profile').click()

  await page.getByTestId('menu-open-login-dialog').click()

  if (connection === 'github') {
    await page.getByTestId('login-with-github').click()
  } else {
    await page.getByTestId('login-with-google').click()
  }

  // Wait for successful login indication
  await expect(page.getByText('Log out')).toBeVisible()
  await page.getByTestId('control-button-profile').click()
}


/**
 * Sets up Playwright route intercepts for handling authentication.
 * Playwright equivalent of setupAuthenticationIntercepts from Cypress.
 *
 * @param page Playwright page object
 */
export async function setupAuthenticationIntercepts(page: Page) {
  const context = page.context()

  // Route patterns: catch both HTTP(s) and any host
  const AUTHORIZE = /\/authorize(\?|$)/
  const TOKEN = /\/oauth\/token(\?|$)/

  // Unroute existing handlers first to avoid conflicts
  await context.unroute(AUTHORIZE)
  await context.unroute(TOKEN)

  // Intercept the /authorize request
  await context.route(AUTHORIZE, async (route: Route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams

    // Extract the 'state' and 'nonce' parameters
    const state = query.get('state') || ''
    const nonce = query.get('nonce') || ''

    const cs = contextState.get(context) ?? {port: DEFAULT_PORT, nonce: ''}
    cs.nonce = nonce
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

    const {nonce = ''} = contextState.get(context) ?? {}

    const payload = {
      nickname: 'cypresstester',
      name: 'cypresstest@bldrs.ai',
      picture: 'https://avatars.githubusercontent.com/u/17447690?v=4',
      updated_at: new Date().toISOString(),
      email: 'cypresstest@bldrs.ai',
      email_verified: true,
      iss: 'https://bldrs.us.auth0.com.msw/',
      aud: 'cypresstestaudience',
      iat: now,
      exp,
      sub: 'github|11111111',
      sid: 'cypresssession-abcdef',
      nonce, // must match nonce from /authorize request
    }

    // Fake JWT: header.payload.signature (header + signature can be anything)
    const header = {alg: 'RS256', typ: 'JWT', kid: 'test-kid'}
    const idToken = `${base64url(header)}.${base64url(payload)}.signature`

    const response = {
      access_token: 'fakeaccesstoken',
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


// Helpers
/**
 * Sets a new value for the context-specific port variable
 *
 * @param context Browser context
 * @param newPort New port number
 */
export function setPort(context: BrowserContext, newPort: number) {
  const state = contextState.get(context) || {port: 0, nonce: ''}
  state.port = newPort
  contextState.set(context, state)
}


/**
 * Retrieves the current value of the context-specific port variable
 *
 * @param context Browser context
 * @return Port number
 */
export function getPort(context: BrowserContext): number {
  return contextState.get(context)?.port || DEFAULT_PORT
}


const getOrigin = (port: number) => `http://127.0.0.1:${port}`


/**
 * URL-safe base64 without padding
 *
 * @param obj Object to encode
 * @return URL-safe base64 string
 */
export function base64url(obj: unknown): string {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj)
  const b64 = Buffer.from(json, 'utf8').toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}


const DEFAULT_PORT = 8080

const HTTP_OK = 200
const MODEL_LOAD_TIMEOUT = 15000
