const {defineConfig} = require('cypress')


module.exports = defineConfig({
  e2e: {
    fileServerFolder: 'docs/',
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    screenshotOnRunFailure: false,
    video: false,
    env: {
      OAUTH2_CLIENT_ID: 'xojbbSyJ9n6HUdZwE7LUX7Zvff6ejxjv',
      AUTH0_DOMAIN: 'bldrs.us.auth0.com',
      GITHUB_BASE_URL: 'bldrs.us.auth0.com',
      RAW_GIT_PROXY_URL: 'https://rawgit.bldrs.dev/r',
      NODE_ENV: 'PRODUCTION'
    },
  },
})
