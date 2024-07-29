/**
 * For jest testing, use fake values with 'jest' tokens to indicate where
 * they're coming from
 */

// Our process.env.XXX variables need to be set in two ways.

// This file is called by jest during config before tests are run.  This is
// setting them the traditional way node passes state in env vars
process.env.AUTH0_DOMAIN = 'https://bldrs.us.auth0.com.jest'
process.env.OAUTH2_CLIENT_ID = 'testaudiencejest'
process.env.GITHUB_BASE_URL = 'https://git.bldrs.dev.jest/p/gh'
process.env.GITHUB_BASE_URL_UNAUTHENTICATED = 'https://api.github.com.jest',
process.env.RAW_GIT_PROXY_URL = 'https://rawgit.bldrs.dev.jest/r'

// After this, they're exported by ./testEnvVars in this directory
// for our other test files to use them.
