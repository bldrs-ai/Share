import {useCallback} from 'react'
import useStore from '../store/useStore'


/*
 * Sign-in that starts at a visible gate (Share#1964): the Export button for a
 * signed-out user, the local-only Share gate. Two facts outlive the click:
 *
 *   1. Where the sign-in came from, for analytics. `login` (useLoginTracking)
 *      gains `{from: 'gate', feature}`, so the funnel can tell gate-driven
 *      sign-ups from the Profile menu's. Module state: the sign-in completes
 *      in this same page (the popup flow's in-page edge, or the mock
 *      provider's in-place state change; see useLoginTracking.js), and it is
 *      read in useLoginTracking's effect, above any component that could
 *      hold it in React state.
 *   2. Where to put the user back, for the UI. The store's
 *      `gateLoginReturn` (UISlice), read by the gated control, e.g.
 *      SaveModelControl reopens the Save dialog on its Export tab.
 *
 * Both are dropped when the login dialog is dismissed without choosing a
 * provider (ProfileControl), and the analytics source also expires after
 * GATE_LOGIN_TTL_MS: a popup the user abandoned must not label a sign-in
 * they make from the Profile menu an hour later.
 */


/** `gateLoginReturn` for the Save dialog's Export tab (SaveModelControl) */
export const GATE_RETURN_EXPORT = 'export'


/** How long a gate's sign-in attribution waits for the sign-in to complete */
export const GATE_LOGIN_TTL_MS = 10 * 60 * 1000 // eslint-disable-line no-magic-numbers


let pendingGateLogin = null


/**
 * Record that a sign-in is starting from the gate guarding `feature`.
 *
 * @param {string} feature e.g. 'export', 'share'
 * @param {number} [now] parameterized for tests
 */
export function noteGateLogin(feature, now = Date.now()) {
  pendingGateLogin = {feature, at: now}
}


/**
 * The `login` params for a gate-started sign-in, consumed: a second sign-in
 * gets none. Empty when no gate started this one or it has expired.
 *
 * @param {number} [now] parameterized for tests
 * @return {object} `{from: 'gate', feature}`, or `{}`
 */
export function takeGateLoginSource(now = Date.now()) {
  const pending = pendingGateLogin
  pendingGateLogin = null
  if (pending === null || now - pending.at > GATE_LOGIN_TTL_MS) {
    return {}
  }
  return {from: 'gate', feature: pending.feature}
}


/** Forget a pending gate sign-in (login dialog dismissed). */
export function clearGateLogin() {
  pendingGateLogin = null
}


/**
 * @return {Function} `(feature, returnTo?) => void`: notes the gate for the
 *   `login` event, records where to return the user after sign-in (when
 *   given), and opens the existing login dialog.
 */
export function useStartGateLogin() {
  const setIsLoginVisible = useStore((state) => state.setIsLoginVisible)
  const setGateLoginReturn = useStore((state) => state.setGateLoginReturn)
  return useCallback((feature, returnTo = null) => {
    noteGateLogin(feature)
    setGateLoginReturn(returnTo)
    setIsLoginVisible(true)
  }, [setIsLoginVisible, setGateLoginReturn])
}
