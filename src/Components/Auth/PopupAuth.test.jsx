import React from 'react'
import {render, waitFor} from '@testing-library/react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {getGrantedGithubScope, saveGrantedGithubScope} from '../../Auth0/githubGrant'
import PopupAuth from './PopupAuth'


jest.mock('../../Auth0/Auth0Proxy')


/** The Auth0 user id the popup's cached session resolves to in these tests. */
const SUB = 'github|111'


describe('PopupAuth', () => {
  let loginWithRedirect

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    loginWithRedirect = jest.fn()
    useAuth0.mockReturnValue({loginWithRedirect, isLoading: false, user: {sub: SUB}})
  })


  /**
   * Render PopupAuth at the given query string and return the
   * authorizationParams it passed to loginWithRedirect.
   *
   * @param {string} search e.g. '?scope=repo&connection=github'
   * @return {Promise<object>} authorizationParams
   */
  async function renderAt(search) {
    window.history.replaceState(null, '', `/popup-auth${search}`)
    render(<PopupAuth/>)
    await waitFor(() => expect(loginWithRedirect).toHaveBeenCalled())
    return loginWithRedirect.mock.calls[0][0].authorizationParams
  }


  it('an explicit repo-scope request widens connection_scope, forces re-consent and stashes for the callback', async () => {
    const params = await renderAt('?scope=repo&connection=github')
    expect(params.connection_scope).toBe('repo')
    expect(params.prompt).toBe('login')
    // Stashed for PopupCallback to commit only after the round trip succeeds.
    expect(sessionStorage.getItem('bldrs.github.pendingScope')).toBe('repo')
    expect(localStorage.getItem('bldrs.github.grantedScope')).toBeNull()
  })

  it('a plain github login re-requests the recorded grant so GitHub does not narrow it', async () => {
    saveGrantedGithubScope('repo', SUB)
    const params = await renderAt('?connection=github')
    expect(params.connection_scope).toBe('repo')
    // No forced upstream re-auth for plain logins — a live Auth0 session
    // means the stored federated token is already right.
    expect(params.prompt).toBeUndefined()
  })

  it('a different user\'s recorded grant is never inherited — and is evicted', async () => {
    // Shared browser: user A opted in, user B's session is now cached. B's
    // plain login must not widen B's token with A's grant (Pro-gate bypass,
    // and a scope B never consented to) — and A's record must not linger.
    saveGrantedGithubScope('repo', 'github|other-user')
    const params = await renderAt('?connection=github')
    expect(params.connection_scope).toBeUndefined()
    expect(getGrantedGithubScope('github|other-user')).toBeNull()
  })

  it('no cached session (post-logout / fresh device) forwards no scope but keeps the record', async () => {
    // The record's owner may be about to log back in — don't destroy their
    // grant, just don't attach it to an unproven identity.
    saveGrantedGithubScope('repo', SUB)
    useAuth0.mockReturnValue({loginWithRedirect, isLoading: false, user: undefined})
    const params = await renderAt('?connection=github')
    expect(params.connection_scope).toBeUndefined()
    expect(getGrantedGithubScope(SUB)).toBe('repo')
  })

  it('a plain github login with no recorded grant adds no connection_scope', async () => {
    const params = await renderAt('?connection=github')
    expect(params.connection_scope).toBeUndefined()
    expect(params.prompt).toBeUndefined()
  })

  it('a non-github connection never inherits the github grant', async () => {
    saveGrantedGithubScope('repo', SUB)
    const params = await renderAt('?connection=google-oauth2')
    expect(params.connection_scope).toBeUndefined()
  })

  it('a plain login clears a stale stash left by an abandoned grant popup', async () => {
    // The named authPopup window is reused, so an abandoned grant's stash
    // can still be present when an unrelated login navigates the window.
    sessionStorage.setItem('bldrs.github.pendingScope', 'repo')
    await renderAt('?connection=github')
    expect(sessionStorage.getItem('bldrs.github.pendingScope')).toBeNull()
  })

  it('a non-github login clears a stale stash too', async () => {
    sessionStorage.setItem('bldrs.github.pendingScope', 'repo')
    await renderAt('?connection=google-oauth2')
    expect(sessionStorage.getItem('bldrs.github.pendingScope')).toBeNull()
  })

  it('forwards a linkToken alongside the remembered scope', async () => {
    saveGrantedGithubScope('repo', SUB)
    const params = await renderAt('?connection=github&linkToken=tok123')
    expect(params.linkToken).toBe('tok123')
    expect(params.connection_scope).toBe('repo')
  })

  it('waits for the Auth0 SDK to settle before redirecting', async () => {
    // The cached-session identity gates the remembered scope, so redirecting
    // while isLoading would race it and silently drop the re-request.
    useAuth0.mockReturnValue({loginWithRedirect, isLoading: true, user: undefined})
    window.history.replaceState(null, '', '/popup-auth?connection=github')
    render(<PopupAuth/>)
    await Promise.resolve()
    expect(loginWithRedirect).not.toHaveBeenCalled()
  })
})
