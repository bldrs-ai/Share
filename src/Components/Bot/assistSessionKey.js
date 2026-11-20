/**
 * The storage key of the assistant's local session log (assistLog.js), and
 * every key derived from it. THE ONE PLACE these strings are built: the log,
 * its cross-tab lease and its Web Lock all take their names from here, so a
 * new input (below) changes them all together and nothing reads or writes a
 * hand-built key.
 *
 * What a session is keyed by today:
 *  - `modelRoute`: the model the conversation is about, as the route's
 *    identity (`routes/modelIdentity.ts`: the download URL, which leaves out
 *    the element path, so selecting an element is the same session). A
 *    paused turn resumes only on the model it was asked about.
 *  - `scope`: whose credits it was asked under ({@link assistScope}), so a
 *    sign-in change maps to a different session, and the old one is cleared
 *    rather than shown to whoever signs in next.
 *
 * More inputs will come as the workspace's sessions land
 * (design/new/workspace-sessions.md §4: a session id, its project, several
 * models), and they go here, as fields of the one object this takes.
 *
 * The key stays on the device (localStorage). It names a model's URL, which
 * for a private model is private: never send a key to analytics or Sentry.
 */


/** Every key this module builds starts with this, so a sweep can find them all. */
export const ASSIST_SESSION_KEY_PREFIX = 'bldrs.assist.session.v1|'

const SEPARATOR = '|'


/**
 * @param {object} inputs
 * @param {string} inputs.modelRoute the model's identity (modelIdentity of the route)
 * @param {string} inputs.scope from {@link assistScope}
 * @return {string} the session's log key
 * @throws {TypeError} when an input is missing or not a string: a key built
 *   from `undefined` would silently share one session across models
 */
export function assistSessionKey({modelRoute, scope}) {
  for (const [name, value] of [['modelRoute', modelRoute], ['scope', scope]]) {
    if (typeof value !== 'string' || value === '') {
      throw new TypeError(`assistSessionKey: ${name} is required`)
    }
  }
  // Encoded, so no input can contain the separator and two different inputs
  // can't build one key.
  return `${ASSIST_SESSION_KEY_PREFIX}${encodeURIComponent(scope)}${SEPARATOR}${encodeURIComponent(modelRoute)}`
}


/**
 * @param {string} sessionKey from {@link assistSessionKey}
 * @return {{log: string, lease: string, lock: string}} the storage key of the
 *   log, of its fallback lease, and the Web Lock name for forwarding
 */
export function assistStorageKeys(sessionKey) {
  return {
    log: sessionKey,
    lease: `${sessionKey}${SEPARATOR}lease`,
    lock: `${sessionKey}${SEPARATOR}forward`,
  }
}


/**
 * @param {string} storageKey any localStorage key
 * @return {boolean} whether it is a session log (not a lease)
 */
export function isAssistLogKey(storageKey) {
  return typeof storageKey === 'string' && storageKey.startsWith(ASSIST_SESSION_KEY_PREFIX) &&
    storageKey.slice(ASSIST_SESSION_KEY_PREFIX.length).split(SEPARATOR).length === 2
}


/**
 * @param {string} storageKey any localStorage key
 * @return {boolean} whether it is a session log's lease
 */
export function isAssistLeaseKey(storageKey) {
  return typeof storageKey === 'string' && storageKey.startsWith(ASSIST_SESSION_KEY_PREFIX) &&
    storageKey.endsWith(`${SEPARATOR}lease`)
}


/**
 * Whose session this is: 'anonymous' signed out, else the signed-in user, as
 * a short hash of their Auth0 `sub` (enough to tell two accounts on one
 * browser apart; not a secret, and the raw id never lands in storage).
 *
 * @param {object} auth
 * @param {boolean} auth.isAuthenticated
 * @param {?string} [auth.userSub] Auth0's `user.sub`
 * @return {string}
 */
export function assistScope({isAuthenticated, userSub}) {
  if (!isAuthenticated) {
    return 'anonymous'
  }
  return `user-${fnv1a(String(userSub ?? ''))}`
}


/**
 * FNV-1a, 32-bit, as hex.
 *
 * @param {string} text
 * @return {string}
 */
function fnv1a(text) {
  /* eslint-disable no-magic-numbers -- the FNV-1a offset basis and prime */
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
  /* eslint-enable no-magic-numbers */
}
