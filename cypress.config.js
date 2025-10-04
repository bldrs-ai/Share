const {defineConfig} = require('cypress')
const failFast = require('cypress-fail-fast/plugin')


const staticEnv = {
  MSW_IS_ENABLED: true,
  // cypress-fail-fast
  FAIL_FAST_ENABLED: 'true',
  FAIL_FAST_STRATEGY: 'run',
  FAIL_FAST_BAIL: '5',
}

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
      trashAssetsBeforeRuns: false,
      setupNodeEvents(on, config) {
        failFast(on, config)
        on('task', {
          log(message) {
            console.warn(message) // Logs message to the terminal (GitHub Actions output)
            return null
          },
        })

        // Merge env with precedence:
        //   CLI/env overrides > file env (STATIC_ENV) > vars from ESM
        config.env = {
          ...vars, // lowest precedence
          ...staticEnv, // file config
          ...config.env, // highest (CLI/env or cypress.json)
        }

        // merge env (and you can set baseUrl here too if needed)
        config.env = {
          ...config.env,
          ...vars,
        }
        return config
      },
    },

    env: staticEnv,
  })
})
