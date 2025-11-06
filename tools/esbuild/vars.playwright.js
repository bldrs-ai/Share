import cypress from './vars.cypress.js'


export default {
  ...cypress,
  OPFS_IS_ENABLED: false,
  THEME_IS_ENABLED: true,

  // These purposely don't have bogus TLDs, as PW specs needs these to pass thru
  // MSW so they can be intercepted and served from the mocks instead.
  RAW_GIT_PROXY_URL_NEW: 'https://rawgit.bldrs.dev/model',
  RAW_GIT_PROXY_URL: 'https://rawgit.bldrs.dev/r',
}
