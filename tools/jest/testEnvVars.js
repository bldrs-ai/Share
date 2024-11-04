// Env vars may now have been setup by Jest, calling ./setupEnvVars.  If so,
// these will work fine in unit tests.
//
// If not, this code is being bundled by esbuild, which will do a string replace
// on these by its config in esbuild.common.define
export default {
  // OAuth
  AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
  OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID,

  // GH API
  GITHUB_BASE_URL: process.env.GITHUB_BASE_URL,
  GITHUB_BASE_URL_UNAUTHENTICATED: process.env.GITHUB_BASE_URL_UNAUTHENTICATED,

  // LFS
  RAW_GIT_PROXY_URL_NEW: process.env.RAW_GIT_PROXY_URL_NEW,
  RAW_GIT_PROXY_URL: process.env.RAW_GIT_PROXY_URL,
}
