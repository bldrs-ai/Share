export default {
  // Auth
  AUTH0_DOMAIN: 'bldrs.us.auth0.com',
  OAUTH2_CLIENT_ID: null,
  OAUTH2_REDIRECT_URI: null, // TODO(pablo): using null in prod to return to window.location.origin
  // GitHub
  GITHUB_API_TOKEN: null, // TODO(pablo): maybe remove? not using anymore
  GITHUB_BASE_URL: 'https://git.bldrs.dev/p/gh',
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
}
