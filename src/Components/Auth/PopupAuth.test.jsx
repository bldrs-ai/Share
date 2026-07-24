import React from 'react'
import {render, waitFor} from '@testing-library/react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import PopupAuth from './PopupAuth'


jest.mock('../../Auth0/Auth0Proxy')


describe('PopupAuth', () => {
  let loginWithRedirect

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    loginWithRedirect = jest.fn()
    useAuth0.mockReturnValue({loginWithRedirect})
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
    localStorage.setItem('bldrs.github.grantedScope', 'repo')
    const params = await renderAt('?connection=github')
    expect(params.connection_scope).toBe('repo')
    // No forced upstream re-auth for plain logins — a live Auth0 session
    // means the stored federated token is already right.
    expect(params.prompt).toBeUndefined()
  })

  it('a plain github login with no recorded grant adds no connection_scope', async () => {
    const params = await renderAt('?connection=github')
    expect(params.connection_scope).toBeUndefined()
    expect(params.prompt).toBeUndefined()
  })

  it('a non-github connection never inherits the github grant', async () => {
    localStorage.setItem('bldrs.github.grantedScope', 'repo')
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
    localStorage.setItem('bldrs.github.grantedScope', 'repo')
    const params = await renderAt('?connection=github&linkToken=tok123')
    expect(params.linkToken).toBe('tok123')
    expect(params.connection_scope).toBe('repo')
  })
})
