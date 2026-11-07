import {AUTH_STEPS} from './authFailureCodes'
import {openAuthPopup, stashAuthPopupConnection, takeAuthPopupConnection} from './authPopup'
import {reportAuthFailure} from './reportAuthFailure'


jest.mock('./reportAuthFailure', () => ({reportAuthFailure: jest.fn()}))


describe('Auth0/authPopup', () => {
  let openSpy

  beforeEach(() => {
    jest.clearAllMocks()
    sessionStorage.clear()
    openSpy = jest.spyOn(window, 'open')
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  it('opens the shared authPopup window and reports nothing when it opens', () => {
    const popup = {}
    openSpy.mockReturnValue(popup)

    expect(openAuthPopup('/popup-auth?connection=github', {connection: 'github'})).toBe(popup)

    expect(openSpy).toHaveBeenCalledWith('/popup-auth?connection=github', 'authPopup', 'width=600,height=600')
    expect(reportAuthFailure).not.toHaveBeenCalled()
  })

  it('reports a blocked popup', () => {
    openSpy.mockReturnValue(null)

    expect(openAuthPopup('/popup-auth?connection=github&linkToken=t', {connection: 'github', flow: 'link'})).toBeNull()

    expect(reportAuthFailure).toHaveBeenCalledWith(AUTH_STEPS.POPUP_OPEN, 'popup_blocked',
      {connection: 'github', flow: 'link'})
  })

  it('hands the popup\'s connection from PopupAuth to PopupCallback once', () => {
    stashAuthPopupConnection('google-oauth2')
    expect(takeAuthPopupConnection()).toBe('google-oauth2')
    expect(takeAuthPopupConnection()).toBeUndefined()
  })
})
