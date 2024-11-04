import cypress from './vars.cypress.js'


export default {
  ...cypress,
  // Share
  OPFS_IS_ENABLED: true,
  THEME_IS_ENABLED: true,
  // Off for accurate performance
  THREE_PDB_IS_ENABLED: false,
  PLATFORM: 'web',
}
