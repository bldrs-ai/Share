import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN} from '../net/http'


/**
 * Client mirror of the export history.
 *
 * Two layers, the same split quotas use (design/new/quotas.md): the server
 * (`netlify/functions/record-export.js` → Auth0 `app_metadata.exports`) is
 * authoritative for a signed-in user, and `exports.<sub>.json` at the OPFS
 * root is the instant-display copy plus the offline fallback. The dialog
 * reads OPFS and never waits on a round trip.
 *
 * OPFS is reached through raw `navigator.storage.getDirectory()` rather than
 * the OPFS worker, exactly as `src/quota/quota.js` does for `quota.json`:
 * this is a small JSON blob at the root, not a model artifact in the
 * (owner, repo, branch) tree the worker addresses, and going through the
 * worker would make the Profile menu depend on the loader being up.
 *
 * ONE FILE PER ACCOUNT. OPFS is partitioned by origin, not by signed-in
 * user, so a single `exports.json` would hand the next Auth0 account on this
 * browser the previous one's titles and share paths — and, since the local
 * row carries `cacheKeyArgs`, its cached artifacts too. Every entry point
 * therefore takes the Auth0 `sub` and addresses `exports.<sub>.json`; no sub
 * (signed out) reads empty and writes nothing.
 *
 * Deliberately React-free — `recordExport` takes the Auth0 calls it needs as
 * callbacks — so the hook layer stays the only place that knows about Auth0.
 *
 * THREE FIELDS NEVER LEAVE THE BROWSER. `cacheKeyArgs`, `schemaVer` and
 * `options` are stored on the local row only, and are what makes "Download
 * again" possible: the server row's `key` is a share path, which cannot be
 * turned back into an OPFS cache key because `sourceCacheKey.js`'s adapters
 * fold in a `sourceHash` (a commit SHA or a content digest) that the path
 * doesn't carry, and the server row records no export options, so a
 * re-download would silently fall back to the defaults and produce a
 * DIFFERENT file from the one the row's size describes (a user who stripped
 * `BLDRS_*` metadata would get it back). They are also the reason a mirror
 * re-attaches local fields ONTO the server's rows instead of replacing those
 * rows wholesale — one-to-one, by the row id this client mints and the
 * server echoes (`withLocalArtifactFields`).
 *
 * Design: design/new/glb-export-premium.md §4.5.
 */


const RECORD_EXPORT_ENDPOINT = '/.netlify/functions/record-export'

// Kept in lock-step with `record-export.js`'s EXPORTS_CAP so the local list
// and the server's agree on what "full" means.
const EXPORTS_CAP = 100

const RADIX_HEX = 16

// A v4 UUID with the random nibbles left as `x` and the variant nibble as
// `y`; `newLocalId` fills them in when `crypto.randomUUID` isn't there.
const UUID_V4_TEMPLATE = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
const UUID_VARIANT_DIGITS = ['8', '9', 'a', 'b']

/** Subscribers notified after every saveExports write, each with its sub */
const listeners = new Set()


/**
 * Subscribe to export-history changes for ONE account. Returns an
 * unsubscribe function.
 *
 * The sub is part of the subscription, not just of the read: two accounts can
 * be observed in one page's lifetime (sign out, sign in as someone else), and
 * a callback registered for the first must not be handed the second's list.
 *
 * @param {?string} sub Auth0 subject of the signed-in user
 * @param {Function} cb Called with the new `{exports}` after each write
 * @return {Function} unsubscribe
 */
export function subscribeToExports(sub, cb) {
  const listener = {sub: sub || null, cb}
  listeners.add(listener)
  return () => listeners.delete(listener)
}


/**
 * The mirror file for one account.
 *
 * `encodeURIComponent` rather than a hash: it is injective (so two accounts
 * can never share a file), deterministic across sessions, and escapes both
 * the `|` every Auth0 sub carries and the `/` a sub from some future
 * connection could, which is the character an OPFS name may not contain.
 *
 * @param {string} sub Auth0 subject, e.g. `github|1234567`
 * @return {string} e.g. `exports.github%7C1234567.json`
 */
function exportsFileName(sub) {
  return `exports.${encodeURIComponent(sub)}.json`
}


/**
 * @param {string} sub Auth0 subject
 * @param {boolean} create
 * @return {Promise<object>} OPFS file handle
 */
async function getHandle(sub, create) {
  const root = await navigator.storage.getDirectory()
  return root.getFileHandle(exportsFileName(sub), {create})
}


/**
 * Read one account's mirrored history from OPFS. Returns the empty default
 * on ANY error — a missing file (nothing exported yet), no signed-in user,
 * and an OPFS that isn't there at all (private browsing) are the same thing
 * to a caller that just wants a list to render.
 *
 * @param {?string} sub Auth0 subject of the signed-in user
 * @return {Promise<{exports: Array<object>}>}
 */
export async function loadExports(sub) {
  if (!sub) {
    return {exports: []}
  }
  try {
    const handle = await getHandle(sub, false)
    const file = await handle.getFile()
    const parsed = JSON.parse(await file.text())
    return {exports: Array.isArray(parsed.exports) ? parsed.exports : []}
  } catch {
    return {exports: []}
  }
}


/**
 * Persist one account's history to OPFS and notify that account's
 * subscribers. OPFS errors are swallowed so the feature degrades to
 * in-memory-only (the subscribers still fire, so an open dialog updates)
 * rather than failing an export that has already been handed to the user.
 *
 * With no sub there is no file to write — nothing signed-out produces a
 * history — but the subscribers still fire, for the same degrade-don't-fail
 * reason.
 *
 * @param {?string} sub Auth0 subject of the signed-in user
 * @param {Array<object>} exportEntries newest first
 * @return {Promise<void>}
 */
export async function saveExports(sub, exportEntries) {
  const state = {exports: exportEntries}
  if (sub) {
    try {
      const handle = await getHandle(sub, true)
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(state))
      await writable.close()
    } catch {
      // OPFS unavailable — subscribers below still see the new state
    }
  }
  for (const listener of listeners) {
    if (listener.sub === (sub || null)) {
      listener.cb(state)
    }
  }
}


/**
 * A row id, generated HERE rather than on the server, and sent with the POST
 * so `record-export.js` echoes it back on the row it writes. That shared id
 * is what lets the mirror re-attach this browser's fields to the RIGHT
 * server row (`withLocalArtifactFields`); matching on key + format alone
 * collapses two exports of the same model (#1834).
 *
 * Shaped as a v4 UUID even on the fallback path, because the server
 * validates the shape and 400s anything else — and an id it rejected would
 * cost the user the history row, not just the id.
 *
 * @return {string} e.g. '5f6b1d7e-1a2b-4c3d-9e4f-0a1b2c3d4e5f'
 */
function newLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // jsdom builds without webcrypto, and any browser on a non-secure origin.
  // Math.random is enough: the id labels a row inside one account's list and
  // is never a secret or a capability.
  return UUID_V4_TEMPLATE.replace(/[xy]/g, (placeholder) => (placeholder === 'x' ?
    Math.floor(Math.random() * RADIX_HEX).toString(RADIX_HEX) :
    UUID_VARIANT_DIGITS[Math.floor(Math.random() * UUID_VARIANT_DIGITS.length)]))
}


/**
 * Re-attach the browser-only fields to the server's authoritative rows.
 *
 * The server never sees `cacheKeyArgs` / `schemaVer` / `options` (the first
 * two identify a file in THIS browser's OPFS and are useless anywhere else;
 * the third says how that file was produced), so a naive mirror would
 * disable "Download again" on every row the moment the server answered — or,
 * worse, keep the button and re-export with the default options.
 *
 * MATCHING IS ONE-TO-ONE, BY ROW ID: the id is minted by `recordExport` and
 * echoed by the server (§4.5), so each server row picks up the fields of the
 * local row it actually IS. Matching on key + format instead — as this did
 * through #1834 — gives EVERY server row for a model+format the newest local
 * row's fields, so a user who exported one model twice with different
 * "Include Bldrs metadata" settings sees the newer options (and cache key)
 * on the older row, and "Download again" there produces a file that is not
 * the one the row's size describes.
 *
 * Key + format survives as the fallback for LEGACY rows — written before the
 * client sent an id, so the server minted its own — and is consumed
 * one-to-one as well, newest with newest, rather than reused. That fallback
 * deliberately ignores `exportedAt`: the server stamps its own, milliseconds
 * after the local row's, so the two never compare equal.
 *
 * @param {Array<object>} serverExports newest first, from record-export
 * @param {Array<object>} localExports newest first, from OPFS
 * @return {Array<object>} server rows carrying local artifact fields
 */
export function withLocalArtifactFields(serverExports, localExports) {
  // Only rows that carry the local fields are worth matching at all.
  const candidates = localExports.filter((entry) => entry.cacheKeyArgs)
  const byId = new Map()
  for (const entry of candidates) {
    if (entry.id && !byId.has(entry.id)) {
      byId.set(entry.id, entry)
    }
  }

  const claimed = new Set()
  const matches = serverExports.map((entry) => {
    const local = entry.id ? byId.get(entry.id) : undefined
    if (local && !claimed.has(local)) {
      claimed.add(local)
      return local
    }
    return null
  })

  // A second pass, so an id match always wins over a key match for the same
  // local row whichever order the two server rows arrive in. Only LEGACY
  // local rows — written before the client minted ids — take part here: an
  // id-bearing local row that found no id match is one the server never
  // accepted (write failed, or pruned past the cap), and pairing it by key
  // with some LATER export of the same model would hand that export the
  // old row's cacheKeyArgs and options — the wrong revision, or metadata
  // the newer file never carried (#1837 round 3).
  serverExports.forEach((entry, i) => {
    if (matches[i]) {
      return
    }
    const local = candidates.find((candidate) =>
      !candidate.id && !claimed.has(candidate) &&
      candidate.key === entry.key && candidate.format === entry.format)
    if (local) {
      claimed.add(local)
      matches[i] = local
    }
  })

  return serverExports.map((entry, i) => {
    const local = matches[i]
    return local ?
      {...entry, cacheKeyArgs: local.cacheKeyArgs, schemaVer: local.schemaVer, options: local.options || null} :
      entry
  })
}


/**
 * Seed this browser's mirror from the account's server-side history.
 *
 * `record-export` writes to Auth0 `app_metadata.exports`, which rides in the
 * JWT claim `BaseRoutes.jsx` decodes into `store.appMetadata` — so on a new
 * device, in a new browser profile, or after the local cache was cleared,
 * the rows exist but the mirror this dialog reads is empty. This is the
 * catch-up: the SAME merge `recordExport` applies to a record response, so a
 * row that does have local artifact fields keeps its "Download again" and a
 * server-only row offers regeneration.
 *
 * An empty (or absent) server list is a no-op rather than a wipe: it means
 * "nothing to hydrate from" — the claim may predate the feature — never
 * "this account has no history". Note the merge is still server-wins for the
 * rows the server DOES have, so a local row the server never accepted
 * (offline, 403) drops out here exactly as it already does the next time
 * `recordExport` mirrors a response.
 *
 * @param {?string} sub Auth0 subject of the signed-in user
 * @param {?Array<object>} serverExports `appMetadata.exports`, newest first
 * @return {Promise<{exports: Array<object>}>} the list now in OPFS
 */
export async function hydrateExports(sub, serverExports) {
  const local = await loadExports(sub)
  if (!sub || !Array.isArray(serverExports) || serverExports.length === 0) {
    return local
  }
  const merged = withLocalArtifactFields(serverExports, local.exports).slice(0, EXPORTS_CAP)
  await saveExports(sub, merged)
  return {exports: merged}
}


/**
 * Record one export: locally first, then on the server.
 *
 * Local first is the whole point of the ordering — the file is already in the
 * user's Downloads by the time this runs, so the history must show it whether
 * or not the network, Auth0 or the function cooperates. The server call then
 * either confirms it (and its response replaces the local list, since it may
 * carry rows written from another device) or leaves the optimistic row alone.
 *
 * NEVER THROWS, and never rejects: a caller in a `finally` after a successful
 * download has nothing useful to do with a failure here.
 *
 * @param {object} entry
 * @param {string} entry.key Share path of the model, e.g. `/share/v/p/x.ifc`
 * @param {string} entry.format Format id from `exportRegistry.js`
 * @param {number} entry.bytes Size of the downloaded file
 * @param {string} [entry.title] Display label; the key's basename otherwise
 * @param {object} [entry.cacheKeyArgs] Local-only; enables "Download again"
 * @param {string} [entry.schemaVer] Local-only; pairs with cacheKeyArgs
 * @param {object} [entry.options] Local-only; the options this export RAN
 *   with, so "Download again" reproduces this file rather than the default
 *   one (a stripped export must not come back with the metadata in it)
 * @param {?string} sub Auth0 subject of the signed-in user; addresses this
 *   account's mirror file
 * @param {Function} [getAccessToken] Returns a Promise of an Auth0 access
 *   token. Omitted means local-only (no server row).
 * @param {Function} [refreshToken] Force-refreshes the JWT after a server
 *   write, so `app_metadata` readers see the new list (the `useQuota` pattern)
 * @return {Promise<object>} `{recorded, status, exports}` — `recorded` is
 *   true only when the server persisted the row, `status` is the HTTP status
 *   when there was one, and `exports` is the list now in OPFS
 */
export async function recordExport(entry, sub, getAccessToken, refreshToken) {
  const {key, format, bytes, title, cacheKeyArgs, schemaVer, options} = entry
  const local = {
    id: newLocalId(),
    key,
    title: title || null,
    format,
    bytes,
    exportedAt: new Date().toISOString(),
    cacheKeyArgs: cacheKeyArgs || null,
    schemaVer: schemaVer || null,
    options: options || null,
  }
  const current = await loadExports(sub)
  const optimistic = [local, ...current.exports].slice(0, EXPORTS_CAP)
  await saveExports(sub, optimistic)

  if (!getAccessToken) {
    return {recorded: false, exports: optimistic}
  }

  let response
  try {
    const token = await getAccessToken()
    response = await fetch(RECORD_EXPORT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      // Only the public fields. cacheKeyArgs/schemaVer/options stay local.
      // The id goes UP so that it comes back down on the server's row: it is
      // what `withLocalArtifactFields` matches on, and without it two
      // exports of one model and format are indistinguishable in the merge.
      body: JSON.stringify({id: local.id, key, format, bytes, title: title || null}),
    })
  } catch {
    // Offline, Auth0 unreachable, function down: the optimistic row stands.
    return {recorded: false, exports: optimistic}
  }

  if (response.status === HTTP_AUTHORIZATION_REQUIRED || response.status === HTTP_FORBIDDEN) {
    // The server disagrees about entitlement. The user still got their file,
    // so the local row stays; the caller decides whether to re-check the tier.
    return {recorded: false, status: response.status, exports: optimistic}
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok || !data || !Array.isArray(data.exports)) {
    return {recorded: false, status: response.status, exports: optimistic}
  }

  const mirrored = withLocalArtifactFields(data.exports, optimistic)
  await saveExports(sub, mirrored)
  if (refreshToken) {
    try {
      await refreshToken()
    } catch {
      // Non-fatal: the mirrored list above is already what the UI reads.
    }
  }
  return {recorded: true, status: response.status, exports: mirrored}
}
