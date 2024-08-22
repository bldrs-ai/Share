import prod from './vars.prod.js'


export default {
  ...prod,
  // Auth
  AUTH0_DOMAIN: 'https://bldrs.us.auth0.com.msw',
  OAUTH2_CLIENT_ID: 'cypresstestaudience',

  // GitHub
  GITHUB_BASE_URL: 'https://git.bldrs.dev.msw/p/gh',
  GITHUB_BASE_URL_UNAUTHENTICATED: 'https://api.github.com.msw',
  RAW_GIT_PROXY_URL: 'https://rawgit.bldrs.dev.msw/model',
  RAW_GIT_PROXY_URL_FALLBACK: 'https://rawgit.bldrs.dev.msw/r',

  // Share
  OPFS_IS_ENABLED: false,
  THEME_IS_ENABLED: false,

  // Testing
  MSW_IS_ENABLED: true,
  // On to enable screenshot testing
  // https://www.browserstack.com/docs/percy/common-issue/canvas-elements-not-captured
  THREE_PDB_IS_ENABLED: true,
}
