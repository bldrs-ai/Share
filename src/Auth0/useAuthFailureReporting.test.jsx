import {renderHook} from '@testing-library/react'
import {useAuth0} from './Auth0Proxy'
import {AUTH_STEPS} from './authFailureCodes'
import {reportAuthFailure, setAuthFailureSub} from './reportAuthFailure'
import useAuthFailureReporting from './useAuthFailureReporting'


jest.mock('./Auth0Proxy')
jest.mock('./reportAuthFailure', () => ({reportAuthFailure: jest.fn(), setAuthFailureSub: jest.fn()}))


describe('Auth0/useAuthFailureReporting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * @param {string} url path and query the page is at
   * @param {object} auth what useAuth0 returns
   * @return {object} renderHook's result
   */
  function renderAt(url, auth) {
    window.history.replaceState(null, '', url)
    useAuth0.mockReturnValue(auth)
    return renderHook(() => useAuthFailureReporting())
  }

  it('reports a failed full-page redirect sign-in', () => {
    const error = {error: 'access_denied'}
    renderAt('/?error=access_denied&error_description=x&state=abc', {error})
    expect(reportAuthFailure).toHaveBeenCalledWith(AUTH_STEPS.REDIRECT_CALLBACK, error)
  })

  it('reports a failed session restore on an ordinary load', () => {
    const error = new TypeError('Failed to fetch')
    renderAt('/share/v/p/index.ifc', {error})
    expect(reportAuthFailure).toHaveBeenCalledWith(AUTH_STEPS.SESSION_RESTORE, error)
  })

  it('leaves /popup-callback to PopupCallback', () => {
    renderAt('/popup-callback?code=c&state=s', {error: new Error('Invalid state')})
    expect(reportAuthFailure).not.toHaveBeenCalled()
  })

  it('reports nothing without an error, and once per error across re-renders', () => {
    const {rerender} = renderAt('/share', {error: undefined})
    expect(reportAuthFailure).not.toHaveBeenCalled()
    const error = {error: 'server_error'}
    useAuth0.mockReturnValue({error})
    rerender()
    rerender()
    expect(reportAuthFailure).toHaveBeenCalledTimes(1)
  })

  it('keeps the reporter\'s signed-in sub current', () => {
    const {rerender} = renderAt('/share', {user: {sub: 'github|1'}})
    expect(setAuthFailureSub).toHaveBeenLastCalledWith('github|1')
    useAuth0.mockReturnValue({user: undefined})
    rerender()
    expect(setAuthFailureSub).toHaveBeenLastCalledWith(undefined)
  })
})
