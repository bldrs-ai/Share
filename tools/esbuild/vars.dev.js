import cypress from './vars.cypress.js'


export default {
  ...cypress,
  // Share
  OPFS_IS_ENABLED: true,
  THEME_IS_ENABLED: true,
  // Off for accurate performance
  THREE_PDB_IS_ENABLED: false,
  PLATFORM: 'web',
  FORCE_SINGLE_THREAD: 'false',

  // served from bldrs.ai in prod, separate server in local dev
  CORS_PROXY_HOST: 'http://localhost:8090',

  // Esbuild hot-reload
  ESBUILD_WATCH: true,
}
