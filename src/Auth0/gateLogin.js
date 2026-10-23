import {useCallback} from 'react'
import useStore from '../store/useStore'


/*
 * Sign-in that starts at a visible gate (Share#1964): the Export button for a
 * signed-out user, the local-only Share gate. One attempt record outlives the
 * click, in localStorage:
 *
 *   {feature, returnTo, attemptId, at}
 *
 * with two parts consumed independently:
 *
 *   1. `feature`, where the sign-in came from, for analytics. `login`
 *      (useLoginTracking) gains `{from: 'gate', feature}`. It is taken by
 *      whichever tab WINS useLoginTracking's cross-tab claim, inside the
 *      claim: every signed-out tab sees the same sign-in, and the attribution
 *      belongs to the one `login` actually sent, not to the tab that happened
 *      to start the gate (codex review on Share#1968). Hence storage shared
 *      across tabs, not module state.
 *   2. `returnTo`, where to put the user back, for the UI, e.g. 'export':
 *      SaveModelControl reopens the Save dialog on its Export tab. Honoured
 *      only in the page that started this attempt (`attemptId` matches this
 *      module's), so a gate abandoned in one tab can't reopen a dialog in
 *      another.
 *
 * Every sign-in start goes through startLogin(): it drops any pending
 * attempt, and a gate then records its own. So a sign-in that is not a
 * gate's (the Profile menu, OpenModelDialog's Connect GitHub,
 * QuotaLimitDialog's Sign up) never inherits a stale attempt (codex review on
 * Share#1968). The record is also dropped when this page's login dialog is
 * dismissed, only if it is still this page's attempt: another tab may have
 * started a newer one since, which must survive. Both parts expire
 * after
 * GATE_LOGIN_TTL_MS: a popup the user abandoned must not label, or reopen
 * Save for, a sign-in made later. Where storage is unavailable nothing is
 * recorded, so nothing is attributed or reopened: it fails closed.
 *
 * This is a measurement signal, not billing; it deliberately stops short of
 * a cross-tab protocol (two tabs consuming the two parts at the same instant
 * can drop one of them).
 */


/** `returnTo` for the Save dialog's Export tab (SaveModelControl) */
export const GATE_RETURN_EXPORT = 'export'


/** How long a gate's attempt waits for the sign-in to complete */
export const GATE_LOGIN_TTL_MS = 10 * 60 * 1000 // eslint-disable-line no-magic-numbers


/** localStorage key of the attempt record */
export const GATE_LOGIN_KEY = 'bldrs.gateLogin'


// The attempt this page started, if any: the only one whose `returnTo` it
// honours.
let myAttemptId = null


/**
 * Record that a sign-in is starting from the gate guarding `feature`.
 *
 * @param {string} feature e.g. 'export', 'share'
 * @param {?string} [returnTo] e.g. GATE_RETURN_EXPORT
 * @param {number} [now] parameterized for tests
 */
export function noteGateLogin(feature, returnTo = null, now = Date.now()) {
  const attemptId = `${now}-${Math.random().toString(36).slice(2)}` // eslint-disable-line no-magic-numbers
  myAttemptId = attemptId
  try {
    localStorage.setItem(GATE_LOGIN_KEY, JSON.stringify({feature, returnTo, attemptId, at: now}))
  } catch {
    // Storage unavailable: no record, so no attribution and no return.
  }
}


/**
 * The `login` params for a gate-started sign-in, consumed: a second sign-in
 * gets none. Empty when no gate started one, it expired, or storage fails.
 * Called by the tab that wins the login claim (useLoginTracking#claimLogin).
 *
 * @param {number} [now] parameterized for tests
 * @return {object} `{from: 'gate', feature}`, or `{}`
 */
export function takeGateLoginSource(now = Date.now()) {
  const record = readRecord(now)
  if (record === null || !record.feature) {
    return {}
  }
  writeRecord({...record, feature: null})
  return {from: 'gate', feature: record.feature}
}


/**
 * Where to return the user after a gate-started sign-in, consumed. Null
 * unless THIS page started the attempt, it has a `returnTo`, and it hasn't
 * expired.
 *
 * @param {number} [now] parameterized for tests
 * @return {?string} e.g. GATE_RETURN_EXPORT
 */
export function takeGateLoginReturn(now = Date.now()) {
  const record = readRecord(now)
  if (record === null || !record.returnTo || record.attemptId !== myAttemptId) {
    return null
  }
  writeRecord({...record, returnTo: null})
  return record.returnTo
}


/**
 * This page's gate attempt was abandoned (its login dialog was dismissed).
 * Removes the record only if it is still this page's attempt: a newer one
 * another tab started since is left alone.
 */
export function abandonGateLogin() {
  const attemptId = myAttemptId
  myAttemptId = null
  if (attemptId === null) {
    return
  }
  try {
    const record = JSON.parse(localStorage.getItem(GATE_LOGIN_KEY))
    if (record && record.attemptId === attemptId) {
      localStorage.removeItem(GATE_LOGIN_KEY)
    }
  } catch {
    // Storage unavailable: there is no record to clear either.
  }
}


/** Forget any gate attempt, whoever started it: a sign-in that is not a gate's. */
export function clearGateLogin() {
  myAttemptId = null
  try {
    localStorage.removeItem(GATE_LOGIN_KEY)
  } catch {
    // Storage unavailable: there is no record to clear either.
  }
}


/**
 * The bookkeeping every sign-in start goes through, BEFORE it opens the
 * login dialog, the popup or the redirect. It drops any pending gate
 * attempt, so a non-gate sign-in can't be attributed to a stale gate or
 * reopen its dialog. With `fromGate`, it then records that gate's attempt.
 *
 * @param {object} [options]
 * @param {?{feature: string, returnTo: (string|undefined)}} [options.fromGate]
 *   the gate starting this sign-in, if any
 */
export function startLogin({fromGate = null} = {}) {
  clearGateLogin()
  if (fromGate) {
    noteGateLogin(fromGate.feature, fromGate.returnTo || null)
  }
}


/**
 * @return {Function} `(feature, returnTo?) => void`: starts a gate's sign-in
 *   (startLogin) and opens the existing login dialog.
 */
export function useStartGateLogin() {
  const setIsLoginVisible = useStore((state) => state.setIsLoginVisible)
  return useCallback((feature, returnTo = null) => {
    startLogin({fromGate: {feature, returnTo}})
    setIsLoginVisible(true)
  }, [setIsLoginVisible])
}


/**
 * @param {number} now
 * @return {?object} the unexpired record, or null (none, expired, unreadable)
 */
function readRecord(now) {
  try {
    const record = JSON.parse(localStorage.getItem(GATE_LOGIN_KEY))
    if (!record || typeof record.at !== 'number' || now - record.at > GATE_LOGIN_TTL_MS) {
      return null
    }
    return record
  } catch {
    return null
  }
}


/**
 * Write back what's left of the record, or remove it once both parts are
 * consumed.
 *
 * @param {object} record
 */
function writeRecord(record) {
  try {
    if (!record.feature && !record.returnTo) {
      localStorage.removeItem(GATE_LOGIN_KEY)
    } else {
      localStorage.setItem(GATE_LOGIN_KEY, JSON.stringify(record))
    }
  } catch {
    // Storage unavailable: nothing more to do; reads fail closed.
  }
}
