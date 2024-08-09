export default {
  APPS_IS_ENABLED: false,

  // Auth
  AUTH0_DOMAIN: 'bldrs.us.auth0.com',
  OAUTH2_CLIENT_ID: null,
  // TODO(pablo): using null in prod to return to window.location.origin
  OAUTH2_REDIRECT_URI: null,

  // GitHub
  // TODO(pablo): maybe remove? not using anymore
  GITHUB_API_TOKEN: null,
  GITHUB_BASE_URL: 'https://git.bldrs.dev/p/gh',
  GITHUB_BASE_URL_UNAUTHENTICATED: 'https://api.github.com',
  RAW_GIT_PROXY_URL: 'http://localhost:8083/model',
  // RAW_GIT_PROXY_URL: 'https://rawgit.bldrs.dev/r',

  // Monitoring
  SENTRY_DSN: null,
  SENTRY_ENVIRONMENT: null,

  // Share
  OPFS_IS_ENABLED: true,
  THEME_IS_ENABLED: true,
  USE_WEBIFC_SHIM: true,

  // Testing
  MSW_IS_ENABLED: false,
  // Off for performance in prod
  // https://threejs.org/docs/#api/en/renderers/WebGLRenderer.preserveDrawingBuffer
  // https://stackoverflow.com/a/40098594
  THREE_PDB_IS_ENABLED: false,
}
