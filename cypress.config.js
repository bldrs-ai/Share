const {defineConfig} = require('cypress')


module.exports = defineConfig({
  projectId: 'z36jue',
  e2e: {
    fileServerFolder: 'docs/',
    port: 61725,
    screenshotOnRunFailure: false,
    video: false,
    pageLoadTimeout: 15000,
  },
})
