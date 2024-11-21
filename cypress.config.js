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
    },
    env: {
      // Used in support/models.js to setup intercepts, should match what code
      // under tests will be using.
      // TODO(pablo): cypress chrome seems to not have OPFS, so using original
      // instead of RAW_GIT_PROXY_URL_NEW
      RAW_GIT_PROXY_URL: vars.RAW_GIT_PROXY_URL,
    },
  })
})
