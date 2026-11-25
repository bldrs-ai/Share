/*
 * Whether a request's Origin is Share's own: the hosts index/ga.js
 * #PROD_HOSTNAMES loads GA on, bldrs' deploy previews, and local dev. A cheap
 * guard for the beacon functions (client-capabilities, model-open-count)
 * against counts posted from elsewhere: a browser always sets Origin on a
 * POST. It keeps out nothing but other sites' pages; a determined caller can
 * set the header.
 */

const ALLOWED_ORIGINS = new Set(['https://bldrs.ai', 'https://www.bldrs.ai', 'http://localhost:8080', 'http://localhost:8888'])
const DEPLOY_PREVIEW_ORIGIN = /^https:\/\/deploy-preview-\d+--bldrs-share(-prod)?\.netlify\.app$/


/**
 * @param {?string} origin the request's Origin header
 * @return {boolean}
 */
export function isShareOrigin(origin) {
  return typeof origin === 'string' && (ALLOWED_ORIGINS.has(origin) || DEPLOY_PREVIEW_ORIGIN.test(origin))
}
