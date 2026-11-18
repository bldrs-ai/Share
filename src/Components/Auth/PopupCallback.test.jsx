import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {AUTH_STEPS} from '../../Auth0/authFailureCodes'
import {stashAuthPopupConnection} from '../../Auth0/authPopup'
import {getGrantedGithubScope, saveGrantedGithubScope} from '../../Auth0/githubGrant'
import {reportAuthFailure} from '../../Auth0/reportAuthFailure'
import PopupCallback from './PopupCallback'


jest.mock('../../Auth0/Auth0Proxy')
jest.mock('../../Auth0/reportAuthFailure', () => ({reportAuthFailure: jest.fn()}))


/** The Auth0 user id the fresh id token carries in these tests. */
const SUB = 'github|111'


describe('PopupCallback', () => {
  let closeSpy

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    useAuth0.mockReturnValue({
      handleRedirectCallback: jest.fn().mockResolvedValue({}),
      getIdTokenClaims: jest.fn().mockResolvedValue({sub: SUB}),
    })
    closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {})
  })

  afterEach(() => {
    closeSpy.mockRestore()
  })


  it('commits a stashed repo grant, keyed to the authenticated user', async () => {
    sessionStorage.setItem('bldrs.github.pendingScope', 'repo')
    render(<PopupCallback/>)
    await waitFor(() => expect(closeSpy).toHaveBeenCalled())
    expect(getGrantedGithubScope(SUB)).toBe('repo')
    // Keyed to THIS user only — another identity reads nothing.
    expect(getGrantedGithubScope('github|other-user')).toBeNull()
    expect(sessionStorage.getItem('bldrs.github.pendingScope')).toBeNull()
    expect(localStorage.getItem('refreshAuth')).toBe('true')
  })

  it('a stashed downgrade clears the recorded grant', async () => {
    saveGrantedGithubScope('repo', SUB)
    sessionStorage.setItem('bldrs.github.pendingScope', 'public_repo')
    render(<PopupCallback/>)
    await waitFor(() => expect(closeSpy).toHaveBeenCalled())
    expect(getGrantedGithubScope(SUB)).toBeNull()
  })

  it('a plain login (no stash) leaves the recorded grant untouched', async () => {
    saveGrantedGithubScope('repo', SUB)
    render(<PopupCallback/>)
    await waitFor(() => expect(closeSpy).toHaveBeenCalled())
    expect(getGrantedGithubScope(SUB)).toBe('repo')
  })

  it('a widen with no resolvable identity is dropped, not saved unattributed', async () => {
    useAuth0.mockReturnValue({
      handleRedirectCallback: jest.fn().mockResolvedValue({}),
      getIdTokenClaims: jest.fn().mockResolvedValue(undefined),
    })
    sessionStorage.setItem('bldrs.github.pendingScope', 'repo')
    render(<PopupCallback/>)
    await waitFor(() => expect(closeSpy).toHaveBeenCalled())
    expect(localStorage.getItem('bldrs.github.grantedScope')).toBeNull()
  })


  describe('when Auth0 comes back with an error', () => {
    const DENIED = Object.assign(new Error('User cancelled'), {error: 'access_denied', error_description: 'User cancelled'})

    beforeEach(() => {
      useAuth0.mockReturnValue({
        handleRedirectCallback: jest.fn().mockRejectedValue(DENIED),
        getIdTokenClaims: jest.fn().mockResolvedValue({sub: SUB}),
      })
    })

    it('reports a failed sign-in with the popup\'s connection, says so, and signals nothing', async () => {
      stashAuthPopupConnection('google-oauth2')
      render(<PopupCallback/>)

      expect(await screen.findByText(/Sign-in didn.t complete/)).toBeInTheDocument()
      expect(reportAuthFailure).toHaveBeenCalledTimes(1)
      expect(reportAuthFailure).toHaveBeenCalledWith(AUTH_STEPS.CALLBACK, DENIED, {connection: 'google-oauth2'})
      expect(localStorage.getItem('refreshAuth')).toBeNull()
      expect(closeSpy).not.toHaveBeenCalled()
    })

    it('reports a failed account link as such, and ends the link attempt', async () => {
      localStorage.setItem('linkStatus', 'inProgress')
      render(<PopupCallback/>)

      await waitFor(() => expect(reportAuthFailure).toHaveBeenCalled())
      expect(reportAuthFailure.mock.calls[0][0]).toBe(AUTH_STEPS.LINK_CALLBACK)
      expect(localStorage.getItem('linkStatus')).toBeNull()
    })

    it('reports a failed GitHub scope change as such, and records no grant', async () => {
      sessionStorage.setItem('bldrs.github.pendingScope', 'repo')
      render(<PopupCallback/>)

      await waitFor(() => expect(reportAuthFailure).toHaveBeenCalled())
      expect(reportAuthFailure.mock.calls[0][0]).toBe(AUTH_STEPS.SCOPE_CALLBACK)
      expect(getGrantedGithubScope(SUB)).toBeNull()
    })
  })

  it('handles the callback once even if the effect runs again', async () => {
    const handleRedirectCallback = jest.fn().mockResolvedValue({})
    useAuth0.mockReturnValue({handleRedirectCallback, getIdTokenClaims: jest.fn().mockResolvedValue({sub: SUB})})
    const {rerender} = render(<React.StrictMode><PopupCallback/></React.StrictMode>)
    useAuth0.mockReturnValue({
      handleRedirectCallback: jest.fn().mockResolvedValue({}),
      getIdTokenClaims: jest.fn().mockResolvedValue({sub: SUB}),
    })
    rerender(<React.StrictMode><PopupCallback/></React.StrictMode>)
    await waitFor(() => expect(closeSpy).toHaveBeenCalled())
    expect(handleRedirectCallback).toHaveBeenCalledTimes(1)
    expect(useAuth0().handleRedirectCallback).not.toHaveBeenCalled()
  })
})
