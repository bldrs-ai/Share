const {defineConfig} = require('cypress')


module.exports = defineConfig({
  projectId: 'z36jue',
  e2e: {
    fileServerFolder: 'docs/',
    screenshotOnRunFailure: false,
    video: false,
    // TODO(pablo): for testing on GHA.  Remove if no effect.
    // https://github.com/cypress-io/cypress/issues/1194
/*    setupNodeEvents(on, config) {
      console.log('SETTING UP BROWSER LAUNCH CB')
      // Implement the 'before:browser:launch' event here
      on('before:browser:launch', (browser = {}, launchOptions) => {
        console.log('RUNNING BROWSER LAUNCH CB')
        if (browser.family === 'chromium') {
          // Filter out '--disable-gpu' argument if present
          const newArgs = launchOptions.args.filter((arg) => arg !== '--disable-gpu')
          // Add '--ignore-gpu-blacklist'
          newArgs.push('--ignore-gpu-blacklist')
          // Modify launchOptions.args to be the newArgs
          launchOptions.args = newArgs
          console.log(' RAN IT ')
        }

        // It's important to return launchOptions, as they may have been modified
        return launchOptions
      })
      return config // Return the config object is important for the setupNodeEvents function
    },*/
  },
})
