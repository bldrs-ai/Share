import {LOCAL_ROUTE_KINDS} from '../quota/limits'


/**
 * The mocks' stand-in for `netlify/functions/_lib/modelVisibility.js
 * #isPublicModel`, shared by the MSW handlers (api-handlers.js) and the
 * Playwright `page.route` fallbacks (tests/e2e/export.ts) so both answer
 * alike. GitHub uses the record-load mock's heuristic — a repo name
 * containing "Public" (the sample repos, e.g. Momentum-Public) is public —
 * since no mock reaches api.github.com; Drive takes the client's word, as
 * the function does; a local file is never public; everything else (hosted
 * `/v/p/`, generic `/v/u/`) is.
 *
 * @param {string} key Share path
 * @param {boolean} drivePublic what the client said about a Drive file
 * @return {boolean}
 */
export function mockIsPublicModel(key, drivePublic) {
  const kind = (/\/v\/([^/?#]+)/.exec(key) || [])[1]
  if (LOCAL_ROUTE_KINDS.includes(kind)) {
    return false
  }
  if (kind === 'g') {
    return drivePublic === true
  }
  if (kind === 'gh') {
    const repo = (key.match(/\/v\/gh\/[^/]+\/([^/]+)\//) || [])[1] || ''
    return mockIsPublicGhRepo(repo)
  }
  return true
}


/**
 * @param {string} repoName
 * @return {boolean} the mocks' "public repo" heuristic
 */
export function mockIsPublicGhRepo(repoName) {
  return /Public/i.test(repoName)
}
