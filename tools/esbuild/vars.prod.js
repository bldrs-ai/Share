export default {
  APPS_IS_ENABLED: true,

  // Auth
  AUTH0_DOMAIN: 'bldrs.us.auth0.com',
  OAUTH2_CLIENT_ID: null,
  // TODO(pablo): using null in prod to return to window.location.origin
  OAUTH2_REDIRECT_URI: null,

  // served from bldrs.ai in prod, separate server in local dev
  CORS_PROXY_HOST: null,
  CORS_PROXY_PATH: '/.netlify/functions/proxy-handler',

  // GitHub
  // TODO(pablo): maybe remove? not using anymore
  GITHUB_API_TOKEN: null,
  GITHUB_BASE_URL: 'https://git.bldrs.dev/p/gh',
  GITHUB_BASE_URL_UNAUTHENTICATED: 'https://api.github.com',


  NODE_ENV: 'production',

  // Monitoring
  SENTRY_DSN: null,
  SENTRY_ENVIRONMENT: null,

  // Share
  OPFS_IS_ENABLED: true,
  THEME_IS_ENABLED: true,
  USE_WEBIFC_SHIM: true,

  // API_KEYS
  GOOGLE_API_KEY: null,
  GOOGLE_OAUTH2_CLIENT_ID: null,
  GOOGLE_APP_ID: null,

  // OpenRouter
  OPENROUTER_BASE_URL: 'https://openrouter.ai',

  // Testing
  MSW_IS_ENABLED: false,
  // Off for performance in prod
  // https://threejs.org/docs/#api/en/renderers/WebGLRenderer.preserveDrawingBuffer
  // https://stackoverflow.com/a/40098594
  THREE_PDB_IS_ENABLED: false,
  PLATFORM: 'web',
  FORCE_SINGLE_THREAD: 'false',

  // Esbuild hot-reload
  ESBUILD_WATCH: false,
}
