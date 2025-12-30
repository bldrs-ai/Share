import {HttpHandler, http, passthrough} from 'msw'
import {
  HTTP_BAD_REQUEST,
  HTTP_NOT_FOUND,
  HTTP_OK,
} from '../net/http'
import apiHandlersGithub, {Defines as GithubDefines} from './api-handlers-github'
import apiHandlersOpenrouter, {Defines as OpenrouterDefines} from './api-handlers-openrouter'


/**
 * Sandbox dev environement during dev, with some passthru for CI.
 *
 * @param defines - Configuration defines
 * @return handlers
 */
export function initHandlers(defines: GithubDefines & OpenrouterDefines): HttpHandler[] {
  const handlers = []
  handlers.push(...prohibitProdAccess())
  handlers.push(...workersAndWasmPassthrough())
  handlers.push(...iconsFontsCssHandlers())

  // Pass through paths that are served by static assets or playwright fixtures
  handlers.push(http.get('/share/v/p/*', () => passthrough()))

  // AI
  handlers.push(...apiHandlersOpenrouter(defines))

  // GitHub
  handlers.push(http.get('/share/v/gh/*', () => passthrough()))
  handlers.push(...apiHandlersGithub(defines, true))
  handlers.push(...apiHandlersGithub(defines, false))
  handlers.push(http.get('https://rawgit.bldrs.dev/model/*', () => passthrough()))
  handlers.push(http.get('https://rawgit.bldrs.dev/r/*', () => passthrough()))

  // Google Drive
  handlers.push(http.get('/share/v/g/*', () => passthrough()))
  handlers.push(...googleApisHandlers())
  handlers.push(http.get('https://www.googleapis.com/drive/v3/files/*', () => passthrough()))

  // Generic URL, especially for local static server
  handlers.push(http.get('/share/v/u/*', () => passthrough()))
  handlers.push(http.get(/^https:\/\/localhost:\d+\//, () => passthrough())) // local static server

  // Analytics
  handlers.push(...gaHandlers())

  // Stripe
  handlers.push(...netlifyHandlers())
  handlers.push(...subscribePageHandler())
  handlers.push(...stripePortalHandlers())

  // Esbuild hot-reload
  handlers.push(...installEsbuildHotReloadHandler())

  return handlers
}


/**
 * Detect and error on absolute refs to prod.
 *
 * @return handlers
 */
function prohibitProdAccess(): HttpHandler[] {
  return [
    http.get('http://bldrs.ai/*', ({request}) => {
      console.error('Found absolute ref to prod:', request.url)
      return new Response('', HTTP_BAD_JSON)
    }),
  ]
}


/**
 * Passthru for expected icons and fonts, null route prod static icon requests.
 *
 * @return handlers
 */
function iconsFontsCssHandlers(): HttpHandler[] {
  return [
    // CSS
    http.get(/\/index\.css$/, () => passthrough()),
    // Icons
    http.get(/\/favicon\.ico$/, () => passthrough()),
    http.get(/\/icons/, () => passthrough()),
    // Fonts
    http.get(/\/roboto-*/, () => passthrough()),
    http.get('http://bldrs.ai/icons/*', () => {
      return new Response('', HTTP_BAD_JSON)
    }),
  ]
}


/**
 * Let requests for web workers, wasm and related files to passthrough.
 *
 * @return handlers
 */
function workersAndWasmPassthrough(): HttpHandler[] {
  return [
    // Caching + OPFS
    http.get(/\/Cache\.js$/, () => passthrough()),
    http.get(/\/OPFS\.worker\.js$/, () => passthrough()),
    // Conway
    http.get(/ConwayGeomWasmWebMT\.wasm$/i, () => passthrough()),
    http.get(/ConwayGeomWasmWebMT\.js$/i, () => passthrough()),
  ]
}


/**
 * Handlers for Netlify functions
 *
 * @return handlers
 */
function netlifyHandlers(): HttpHandler[] {
  return [
    http.post('/.netlify/functions/create-portal-session', async ({request}) => {
      const {stripeCustomerId} = await request.json() as {stripeCustomerId?: string}

      if (!stripeCustomerId) {
        return new Response(JSON.stringify({error: 'Missing stripeCustomerId'}), HTTP_BAD_JSON)
      }

      // return a mocked Stripe billing-portal URL
      const fakeUrl = `https://stripe.portal.msw/mockportal/session/${stripeCustomerId}`
      return new Response(JSON.stringify({url: fakeUrl}), HTTP_OK_JSON)
    }),
  ]
}

/**
 * Mock out the “/subscribe” page itself.
 *
 * @return handlers
 */
function subscribePageHandler(): HttpHandler[] {
  return [
    // this will catch GET /subscribe, /subscribe/, or /subscribe?foo=bar
    http.get('/subscribe*', () => {
      return new Response(
        `<!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8">
              <title>Mock Subscribe Page</title>
            </head>
            <body>
              <h1>Mock Subscribe Page</h1>
              <p>Mock Stripe UI.</p>
              <button id="start-payment">Start Payment</button>
            </body>
          </html>
        `.trim(),
        HTTP_OK_JSON)
    }),
  ]
}


/**
 * Catch the client navigating to the fake Stripe portal page.
 *
 * @return handlers
 */
function stripePortalHandlers(): HttpHandler[] {
  return [
    http.get('https://stripe.portal.msw/mockportal/session/:stripeCustomerId', () => {
      return new Response('<html><body><h1>Mock Stripe Portal</h1></body></html>', HTTP_OK_JSON)
    }),
  ]
}


/**
 * Mock to disable Google Analytics.
 *
 * @return handlers
 */
function gaHandlers(): HttpHandler[] {
  const gaUrl = 'https://*.google-analytics.com/*'
  const gtmUrl = 'https://*.googletagmanager.com/*'
  return [
    http.get(gaUrl, () => GET_RSP_OK_JSON),
    http.post(gaUrl, () => POST_RSP_OK_NULL),
    http.get(gtmUrl, () => GET_RSP_OK_JSON),
  ]
}


/**
 * Google APIs handlers
 *
 * @return handlers
 */
function googleApisHandlers(): HttpHandler[] {
  const gaUrl = 'https://*.googleapis.com/*'
  return [
    http.get(gaUrl, () => GET_RSP_OK_JSON),
    http.post(gaUrl, () => POST_RSP_OK_NULL),
  ]
}


/**
 * Passthru for esbuild hot-reload plugin
 *
 * @return handlers
 */
function installEsbuildHotReloadHandler(): HttpHandler[] {
  const ESBUILD_WATCH = (typeof process !== 'undefined' && process.env?.ESBUILD_WATCH)
  if (ESBUILD_WATCH) {
    return [
      http.get(/\/esbuild/, () => passthrough()),
    ]
  } else {
    // Not enabled in cypress
    return []
  }
}


// Helpers
const JSON_CONTENT_TYPE = {'Content-Type': 'application/json'}
export const HTTP_OK_JSON = {status: HTTP_OK, headers: JSON_CONTENT_TYPE}
export const HTTP_BAD_JSON = {status: HTTP_BAD_REQUEST, headers: JSON_CONTENT_TYPE}
export const HTTP_NOT_FOUND_JSON = {status: HTTP_NOT_FOUND, headers: JSON_CONTENT_TYPE}
export const GET_RSP_OK_JSON = new Response(JSON.stringify({}), HTTP_OK_JSON)
export const POST_RSP_OK_NULL = new Response(null, HTTP_OK_JSON)
