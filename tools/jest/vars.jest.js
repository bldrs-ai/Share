import cypress from '../esbuild/vars.cypress.js'


/**
 * Return the env vars from below for dymamic import e.g. in MSW api-handlers,
 * but also set them in the process environment.
 *
 * @return {object} env vars with 'process.env.FOO' style keys
 */
export function getAndExportEnvVars() {
  Object.entries(vars).forEach(([key, value]) => {
    process.env[key] = value
  })
  return vars
}


/**
 * For jest testing, use fake values with 'jest' tokens to indicate where
 * they're coming from
 */
const vars = {
  ...cypress,
  AUTH0_DOMAIN: 'https://bldrs.us.auth0.com.jest',
  OAUTH2_CLIENT_ID: 'testaudiencejest',
  GITHUB_BASE_URL: 'https://git.bldrs.dev.jest/p/gh',
  GITHUB_BASE_URL_UNAUTHENTICATED: 'https://api.github.com.jest',
  RAW_GIT_PROXY_URL_NEW: 'https://rawgit.bldrs.dev.jest/model',
  RAW_GIT_PROXY_URL: 'https://rawgit.bldrs.dev.jest/r',
  // Some test code in Mui will warn without this.
  NODE_ENV: 'test',
}
