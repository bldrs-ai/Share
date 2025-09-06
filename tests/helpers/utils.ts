import {Page, BrowserContext, expect} from '@playwright/test'
import {readFile} from 'fs/promises'
import {join} from 'path'


let port = 0
let nonce = ''
let fixturesDir = join(__dirname, '..', '..', 'cypress', 'fixtures')


/**
 * Clear browser storage and cookies
 */
export async function clearState(context: BrowserContext) {
  await context.clearCookies()
  await context.clearPermissions()
}


/**
 * Intercept load of index.ifc to serve fixture data.
 * Playwright equivalent of cy.intercept('GET', '/index.ifc', {fixture: 'index.ifc'})
 */
export async function interceptIndex(page: Page) {
  await page.route('**/index.ifc', async (route) => {
    try {
      const fixtureData = await readFile(`${fixturesDir}/index.ifc`, 'utf-8')
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: fixtureData,
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

  for (const pattern of patterns) {
    await page.route(pattern, async (route) => {
      try {
        const fixturePath = `${fixturesDir}/404.html`
        const fixtureData = await readFile(fixturePath, 'utf-8')
        
        await route.fulfill({
          status: 404,
          contentType: 'text/html; charset=utf-8',
          body: fixtureData,
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
 * Clear state and setup initial homepage intercepts
 */
export async function homepageSetup(page: Page, context: BrowserContext) {
  await clearState(context)
  await interceptInitialLoads(page)
}


/**
 * Set cookie indicating user has visited before
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
 */
export async function visitHomepage(page: Page) {
  await page.goto('/', {waitUntil: 'domcontentloaded'})
}


/**
 * Sets state for returning user and visit homepage
 */
export async function returningUserVisitsHomepage(page: Page, context: BrowserContext) {
  await setIsReturningUser(context)
  await visitHomepage(page)
}


/**
 * Same as returningUserVisitsHomepage, but wait for model too
 */
export async function returningUserVisitsHomepageWaitForModel(page: Page, context: BrowserContext) {
  await returningUserVisitsHomepage(page, context)
  await waitForModel(page)
}


/**
 * Assumes other setup, then visit homepage and wait for model
 */
export async function visitHomepageWaitForModel(page: Page) {
  await visitHomepage(page)
  await waitForModel(page)
}


/**
 * Waits for a 3D model to load and become visible within the viewer.
 * Playwright equivalent of Cypress waitForModel function.
 */
export async function waitForModel(page: Page) {
  // Wait for viewer container and canvas
  const viewerContainer = page.locator('#viewer-container')
  await expect(viewerContainer).toBeVisible()
  
  const canvas = viewerContainer.locator('canvas')
  await expect(canvas).toBeVisible()

  // Wait for model ready attribute
  const modelReadyElement = page.locator('[data-model-ready="true"]')
  await expect(modelReadyElement).toBeVisible({timeout: 10000})
  
  // Wait for animations to settle (equivalent to cy.wait(animWaitTimeMs))
  const animWaitTimeMs = 1000
  await page.waitForTimeout(animWaitTimeMs)
  
  // TODO: Ideally we wait for camera-controls rest event
  // const cameraAtRest = page.locator('[data-is-camera-at-rest="true"]')
  // await expect(cameraAtRest).toBeVisible({timeout: 5000})
}


/**
 * Performs a simulated login using Auth0 by interacting with UI elements.
 * Note: Requires authentication intercepts to be set up first.
 */
export async function auth0Login(page: Page, connection: 'github' | 'google' = 'github') {
  await page.getByTestId('control-button-profile').click()
  console.log('Simulating login')

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
 * Sets a new value for the global port variable
 */
export function setPort(newPort: number) {
  port = newPort
}


/**
 * Retrieves the current value of the global port variable
 */
export function getPort(): number {
  return port
}


/**
 * Base64 encode a payload object
 */
export function base64EncodePayload(payload: Record<string, any>): string {
  // Convert the payload object to a JSON string
  const jsonString = JSON.stringify(payload)
  // Convert the JSON string to a Base64Url encoded string
  const base64UrlString = btoa(jsonString)
    .replace(/\+/g, '-') // Convert '+' to '-'
    .replace(/\//g, '_') // Convert '/' to '_'
    .replace(/=+$/, '') // Remove trailing '='
  return base64UrlString
}


/**
 * Sets up Playwright route intercepts for handling authentication.
 * Playwright equivalent of setupAuthenticationIntercepts from Cypress.
 */
export async function setupAuthenticationIntercepts(page: Page) {
  // Intercept the /authorize request
  await page.route('**/authorize*', async (route) => {
    const url = new URL(route.request().url())
    const queryParams = new URLSearchParams(url.search)

    // Extract the 'nonce' and 'state' parameters
    nonce = queryParams.get('nonce') || ''
    const state = queryParams.get('state') || ''

    console.log('[PLAYWRIGHT] 200 **/authorize', route.request().url())

    // Send back modified response
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `
<!DOCTYPE html>
<html>
  <head><title>Authorization Response</title></head>
  <body>
    <script type="text/javascript">
      (function(window, document) {
        var targetOrigin = "http://localhost:${port}";
        var webMessageRequest = {};
        var authorizationResponse = {
          type: "authorization_response",
          response: {
            "code":"MMHHFcQ1bA-CrsFi6ctzt4wLc-aIljuJbdUyijNOdmtbE",
            "state":"${state}"
          }
        };
        var mainWin = (window.opener) ? window.opener : window.parent;
        if (webMessageRequest["web_message_uri"] && webMessageRequest["web_message_target"]) {
          window.addEventListener("message", function(evt) {
            switch (evt.data.type) {
              case "relay_response":
                var messageTargetWindow = evt.source.frames[webMessageRequest["web_message_target"]];
                if (messageTargetWindow) {
                  messageTargetWindow.postMessage(authorizationResponse, webMessageRequest["web_message_uri"]);
                  window.close();
                }
                break;
            }
          });
          mainWin.postMessage({type: "relay_request"}, targetOrigin);
        } else {
          mainWin.postMessage(authorizationResponse, targetOrigin);
        }
      })(this, this.document);
    </script>
  </body>
</html>`,
    })
  })

  // Intercept the /oauth/token request
  await page.route('**/oauth/token*', async (route) => {
    // Update the iat and exp values
    const currentTimeInSeconds = Math.floor(Date.now() / 1000)
    const DAY = 86400
    const iat = currentTimeInSeconds
    const exp = currentTimeInSeconds + DAY // Add 24 hours

    const payload = {
      nickname: 'cypresstester',
      name: 'cypresstest@bldrs.ai',
      picture: 'https://avatars.githubusercontent.com/u/17447690?v=4',
      updated_at: '2024-02-20T02:57:40.324Z',
      email: 'cypresstest@bldrs.ai',
      email_verified: true,
      iss: 'https://bldrs.us.auth0.com.msw/',
      aud: 'cypresstestaudience',
      iat: iat,
      exp: exp,
      sub: 'github|11111111',
      sid: 'cypresssession-abcdef',
      nonce: nonce,
    }

    // Encode the updated payload
    const encodedPayload = base64EncodePayload(payload)

    console.log('[PLAYWRIGHT] 200 **/oauth/token*', route.request().url())

    // Send back modified response
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'testaccesstoken',
        id_token: `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InF2dFhNWGZBRDQ5Mmd6OG5nWmQ3TCJ9.${encodedPayload}.otfuWiLuQlJz9d0uX2AOf4IFX4LxS-Vsq_Jt5YkDF98qCY3qQHBaiXnlyOoczjcZ3Zw9Ojq-NlUP27up-yqDJ1_RJ7Kiw6LV9CeDAytNvVdSXEUYJRRwuBDadDMfgNEA42y0M29JYOL_ArPUVSGt9PWFKUmKdobxqwdqwMflFnw3ypKAATVapagfOoAmgjCs3Z9pOgW-Vm1bb3RiundtgCAPNKg__brz0pyW1GjKVeUaoTN9LH8d9ifiq2mOWYvglpltt7sB596CCNe15i3YeFSQoUxKOpCb0kkd8oR_-dUtExJrWvK6kEL6ibYFCU659-qQkoI4r08h_L6cDFm62A`,
        scope: 'openid profile email offline_access',
        expires_in: 86400,
        token_type: 'Bearer',
      }),
    })
  })
}


/**
 * Enhanced homepage setup with authentication intercepts
 */
export async function homepageSetupWithAuth(page: Page, context: BrowserContext) {
  await homepageSetup(page, context)
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
 */
export async function waitForModelWithNetworkCheck(page: Page) {
  // Set up a promise to track model loading network request
  const modelLoadPromise = page.waitForResponse(
    (response) => response.url().includes('index.ifc') && response.status() === 200,
    {timeout: 15000}
  )

  // Wait for both network response and DOM readiness
  await Promise.all([
    modelLoadPromise,
    waitForModel(page),
  ])
}
