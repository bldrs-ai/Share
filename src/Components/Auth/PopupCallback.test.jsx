import React from 'react'
import {render, waitFor} from '@testing-library/react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {getGrantedGithubScope, saveGrantedGithubScope} from '../../Auth0/githubGrant'
import PopupCallback from './PopupCallback'


jest.mock('../../Auth0/Auth0Proxy')


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
})
