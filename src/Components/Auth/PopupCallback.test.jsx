import React from 'react'
import {render, waitFor} from '@testing-library/react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import PopupCallback from './PopupCallback'


jest.mock('../../Auth0/Auth0Proxy')


describe('PopupCallback', () => {
  let closeSpy

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    useAuth0.mockReturnValue({
      handleRedirectCallback: jest.fn().mockResolvedValue({}),
      getIdTokenClaims: jest.fn(),
    })
    closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {})
  })

  afterEach(() => {
    closeSpy.mockRestore()
  })


  it('commits a stashed repo grant after a successful callback', async () => {
    sessionStorage.setItem('bldrs.github.pendingScope', 'repo')
    render(<PopupCallback/>)
    await waitFor(() => expect(closeSpy).toHaveBeenCalled())
    expect(localStorage.getItem('bldrs.github.grantedScope')).toBe('repo')
    expect(sessionStorage.getItem('bldrs.github.pendingScope')).toBeNull()
    expect(localStorage.getItem('refreshAuth')).toBe('true')
  })

  it('a stashed downgrade clears the recorded grant', async () => {
    localStorage.setItem('bldrs.github.grantedScope', 'repo')
    sessionStorage.setItem('bldrs.github.pendingScope', 'public_repo')
    render(<PopupCallback/>)
    await waitFor(() => expect(closeSpy).toHaveBeenCalled())
    expect(localStorage.getItem('bldrs.github.grantedScope')).toBeNull()
  })

  it('a plain login (no stash) leaves the recorded grant untouched', async () => {
    localStorage.setItem('bldrs.github.grantedScope', 'repo')
    render(<PopupCallback/>)
    await waitFor(() => expect(closeSpy).toHaveBeenCalled())
    expect(localStorage.getItem('bldrs.github.grantedScope')).toBe('repo')
  })
})
