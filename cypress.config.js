const {defineConfig} = require('cypress')


module.exports = defineConfig({
  projectId: "z36jue",
  e2e: {
    fileServerFolder: 'docs/',
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    screenshotOnRunFailure: true,
    video: true,
    defaultCommandTimeout: 60000, // Set default command timeout to 20 seconds
  },
})
