const {defineConfig} = require('cypress')


module.exports = import('./tools/esbuild/vars.cypress.js').then(({
  default: vars,
}) => {
  return defineConfig({
    projectId: 'z36jue',
    e2e: {
      fileServerFolder: 'docs/',
      port: 61725,
      screenshotOnRunFailure: false,
      video: false,
      pageLoadTimeout: 15000,
      setupNodeEvents(on, config) {
        on('task', {
          log(message) {
            console.warn(message) // Logs message to the terminal (GitHub Actions output)
            return null
          },
        })
      },
    },
    env: {
      // Used in support/models.js to setup intercepts, should match what code
      // under tests will be using.
      AUTH0_DOMAIN: vars.AUTH0_DOMAIN,
      GITHUB_BASE_URL: vars.GITHUB_BASE_URL,
      GITHUB_BASE_URL_UNAUTHENTICATED: vars.GITHUB_BASE_URL_UNAUTHENTICATED,
      MSW_IS_ENABLED: true,
      OAUTH2_CLIENT_ID: vars.OAUTH2_CLIENT_ID,
      // TODO(pablo): cypress chrome seems to not have OPFS, so using original
      // instead of RAW_GIT_PROXY_URL_NEW
      RAW_GIT_PROXY_URL: vars.RAW_GIT_PROXY_URL,
      RAW_GIT_PROXY_URL_NEW: vars.RAW_GIT_PROXY_URL_NEW,
    },
  })
})
