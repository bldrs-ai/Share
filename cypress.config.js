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
      OAUTH2_CLIENT_ID: 'cypresstestaudience',
      AUTH0_DOMAIN: null,
      RAW_GIT_PROXY_URL: 'https://rawgit.bldrs.dev/r',
      NODE_ENV: 'development'
    },
  },
})
