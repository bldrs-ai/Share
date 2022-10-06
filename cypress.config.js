const {defineConfig} = require('cypress')


module.exports = defineConfig({
  e2e: {
    fileServerFolder: 'docs/',
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    screenshotOnRunFailure: false,
    video: false,
  },
})
