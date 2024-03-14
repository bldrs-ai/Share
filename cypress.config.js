const {defineConfig} = require('cypress')


module.exports = defineConfig({
  projectId: 'z36jue',
  e2e: {
    fileServerFolder: 'docs/',
    screenshotOnRunFailure: false,
    video: false,
  },
})
