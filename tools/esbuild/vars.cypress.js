import prod from './vars.prod.js'


export default {
  ...prod,
  // Auth
  AUTH0_DOMAIN: 'https://bldrs.us.auth0.com.msw',
  OAUTH2_CLIENT_ID: 'cypresstestaudience',

  // GitHub
  GITHUB_BASE_URL: 'https://git.bldrs.dev.msw/p/gh',
  GITHUB_BASE_URL_UNAUTHENTICATED: 'https://api.github.com.msw',

  NODE_ENV: 'development',

  // Share
  OPFS_IS_ENABLED: false,
  THEME_IS_ENABLED: false,

  // API_KEYS
  GOOGLE_API_KEY: 'test-key-12345',
  GOOGLE_OAUTH2_CLIENT_ID: 'test-oauth-client-id',
  GOOGLE_APP_ID: 'test-app-id',

  // OpenRouter
  OPENROUTER_BASE_URL: 'https://localhost/openrouter',

  // Testing
  MSW_IS_ENABLED: true,
  ESBUILD_WATCH: false,
  // On to enable screenshot testing
  // https://www.browserstack.com/docs/percy/common-issue/canvas-elements-not-captured
  THREE_PDB_IS_ENABLED: true,
  PLATFORM: 'web',
  FORCE_SINGLE_THREAD: 'false',
}
