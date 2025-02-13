export default {
  APPS_IS_ENABLED: true,

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

  NODE_ENV: 'production',

  /**
   * RAW_GIT_PROXY_URL_NEW uses the /model endpoint for gitredir. This
   * endpoint is passed a cached etag, and returns either a 304 (cached),
   * or the GHUC download URL with the etag returned from GHUC server. If
   * there is a new etag it is cached.
   */
  RAW_GIT_PROXY_URL_NEW: 'https://rawgit.bldrs.dev/model',
  // This is the fallback if OPFS is not available, original gitredir
  // functionality.
  RAW_GIT_PROXY_URL: 'https://rawgit.bldrs.dev/r',

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
  PLATFORM: 'web',
  FORCE_SINGLE_THREAD: 'false',
}
