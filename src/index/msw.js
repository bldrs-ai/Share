/**
 * Setup MSW for testing.
 */
export default function setupMSW() {
  // NB: This transcludes all msw for testing.  Without it the prod build is much
  // smaller.
  if (process.env.MSW_IS_ENABLED) {
    const {initWorker} = require('../__mocks__/browser')
    // We used to read process.env in api-helpers, but that was behind the dynamic
    // require above (which saves us from putting all of msw into prod).  Those
    // defines were getting removed during esbuild tree shaking.  So, to maintain
    // a single interface, any env var playwright needs we also pass in here to
    // ensure it's visible to esbuild and the dependent codepaths work correctly.
    //
    // Should match with ./tools/playwright.config.js
    const worker = initWorker({
      AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
      GITHUB_BASE_URL: process.env.GITHUB_BASE_URL,
      GITHUB_BASE_URL_UNAUTHENTICATED: process.env.GITHUB_BASE_URL_UNAUTHENTICATED,
      MSW_IS_ENABLED: process.env.MSW_IS_ENABLED,
      OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID,
      OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
      RAW_GIT_PROXY_URL: process.env.RAW_GIT_PROXY_URL,
      RAW_GIT_PROXY_URL_NEW: process.env.RAW_GIT_PROXY_URL_NEW,
    })
    worker.start({
      onUnhandledRequest(req) {
        if (req.url.host === 'api.github.com') {
          console.warn(`Found an unhandled GH API request: ${req.method} ${req.url}`)
        } else {
          console.warn(`Found an unhandled non-GH request: ${req.method} ${req.url}`)
        }
      },
    })
  }
}
