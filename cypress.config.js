const {defineConfig} = require('cypress')


module.exports = defineConfig({
  projectId: "z36jue",
  e2e: {
    fileServerFolder: 'docs/',
    setupNodeEvents(on, config) {
      // implement node event listeners here
      const options_log_printer = {
        printLogsToConsole: "always"
      };
      require('cypress-terminal-report/src/installLogsPrinter')(on, options_log_printer);
    },
    screenshotOnRunFailure: true,
    video: true,
    defaultCommandTimeout: 60000, // Set default command timeout to 20 seconds
  },
})
