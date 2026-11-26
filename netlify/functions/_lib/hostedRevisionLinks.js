import {createHash, randomBytes} from 'node:crypto'


const TOKEN_BYTES = 32
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const OWNER_PATTERN = /^[a-z0-9-]+$/i
const REPO_PATTERN = /^[a-z0-9_.-]+$/i
const COMMIT_PATTERN = /^[a-f0-9]{40}$/
const PUBLIC_AT_SOURCE = 'public-at-source'
const RESTRICTED_AT_SOURCE = 'restricted-at-source'


/**
 * Build the Phase C resolver against an immutable store and a source access
 * check. This module has no HTTP entry point. A caller must authenticate
 * creation, confirm the share action, verify source access with the
 * provider, and enforce rate limits and token redaction at the HTTP boundary.
 *
 * @param {object} options
 * @param {object} options.store Keyed by a token digest. insert must be an atomic create-if-absent.
 * @param {Function} options.checkSourceAccess Returns a source visibility label only if the actor can read the exact file.
 * @return {object} The create and resolve operations. Null means unavailable.
 */
export function createHostedRevisionResolver({store, checkSourceAccess}) {
  /**
   * @param {object} source GitHub file at a full commit
   * @param {string} actor Verified publisher identity
   * @return {Promise<?string>} The opaque link token after the store accepts the record
   */
  async function create(source, actor) {
    const revision = githubRevision(source)
    if (!revision || !actor || !await sourceVisibility(revision, actor)) {
      return null
    }
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    if (await store.insert(tokenKey(token), revision) !== true) {
      throw new Error('Could not create revision link')
    }
    return token
  }

  /**
   * @param {string} token
   * @param {?string} [actor] Verified recipient identity, or null if signed out
   * @return {Promise<?object>} The exact revision and its current source visibility
   */
  async function resolve(token, actor = null) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token) ||
        Buffer.from(token, 'base64url').toString('base64url') !== token) {
      return null
    }
    const source = githubRevision(await store.get(tokenKey(token)))
    if (!source) {
      return null
    }
    const visibility = await sourceVisibility(source, actor)
    return visibility ? {source, visibility} : null
  }

  /**
   * @param {object} source
   * @param {?string} actor
   * @return {Promise<?string>} Verified visibility for this actor
   */
  async function sourceVisibility(source, actor) {
    const visibility = await checkSourceAccess(source, actor)
    if (visibility === PUBLIC_AT_SOURCE || (actor && visibility === RESTRICTED_AT_SOURCE)) {
      return visibility
    }
    return null
  }

  return {create, resolve}
}


/**
 * @param {object} [source] A decoded source locator, never a URL or branch
 * @return {?object} Only the fields needed to open this revision
 */
function githubRevision(source) {
  const {owner, repo, commit, path} = source ?? {}
  if (typeof owner !== 'string' || !OWNER_PATTERN.test(owner) ||
      typeof repo !== 'string' || !REPO_PATTERN.test(repo) || repo === '.' || repo === '..' ||
      typeof commit !== 'string' || !COMMIT_PATTERN.test(commit) ||
      typeof path !== 'string' || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    return null
  }
  return {owner, repo, commit, path}
}


/**
 * Store the digest so reading the backing record does not yield a link.
 *
 * @param {string} token
 * @return {string} The opaque lookup key
 */
function tokenKey(token) {
  return createHash('sha256').update(token).digest('hex')
}
