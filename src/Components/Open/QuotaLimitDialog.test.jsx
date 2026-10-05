import React, {StrictMode} from 'react'
import {act, fireEvent, render} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../../__mocks__/authentication'
import {_resetGaClientIdForTests, setGaClientId} from '../../privacy/analytics'
import {TIERS} from '../../quota/quota'
import useStore from '../../store/useStore'
import {ThemeCtx} from '../../theme/Theme.fixture'
import {goToSubscription} from '../Profile/subscriptionNav'
import QuotaLimitDialog from './QuotaLimitDialog'


jest.mock('../Profile/subscriptionNav', () => ({goToSubscription: jest.fn()}))


describe('QuotaLimitDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    _resetGaClientIdForTests()
    window.gtag = jest.fn()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    act(() => useStore.setState({appMetadata: {}}))
  })

  afterEach(() => {
    delete window.gtag
  })

  /** @return {Array} quota_limit_reached gtag calls so far */
  function limitEvents() {
    return window.gtag.mock.calls.filter(([kind, name]) => kind === 'event' && name === 'quota_limit_reached')
  }

  /**
   * @param {object} props
   * @return {object} render result, with `show(props)` to rerender
   */
  function renderDialog(props) {
    const ui = (p) => (
      <StrictMode>
        <ThemeCtx>
          <QuotaLimitDialog onClose={() => {}} {...p}/>
        </ThemeCtx>
      </StrictMode>
    )
    const result = render(ui(props))
    return {...result, show: (p) => result.rerender(ui(p))}
  }

  it('reports quota_limit_reached once per showing, with tier, feature and open_cid', () => {
    setGaClientId('111.222')
    // StrictMode runs the mount effect twice; still one event.
    const {show} = renderDialog({tier: TIERS.FREE, isOpen: true})
    expect(limitEvents()).toEqual([[
      'event', 'quota_limit_reached', {tier: 'free', feature: 'private_load', open_cid: 'cid.111.222'},
    ]])

    // Re-rendering while open — even with a new tier — is the same showing.
    show({tier: TIERS.ANONYMOUS, isOpen: true})
    expect(limitEvents()).toHaveLength(1)

    // Close and reopen: a new showing.
    show({tier: TIERS.ANONYMOUS, isOpen: false})
    show({tier: TIERS.ANONYMOUS, isOpen: true})
    expect(limitEvents()).toHaveLength(2)
    expect(limitEvents()[1][2]).toEqual({tier: 'anonymous', feature: 'private_load', open_cid: 'cid.111.222'})
  })

  it('stays quiet while closed', () => {
    renderDialog({tier: TIERS.FREE, isOpen: false})
    expect(limitEvents()).toHaveLength(0)
  })

  it('reports a missing tier as anonymous, as the copy reads it', () => {
    renderDialog({isOpen: true})
    expect(limitEvents()[0][2]).toEqual({tier: 'anonymous', feature: 'private_load'})
  })

  it('sends Subscribe through goToSubscription as the quota entry point', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    act(() => useStore.setState({appMetadata: {stripeCustomerId: null, userEmail: 'free@test.com'}}))
    const onClose = jest.fn()
    const {getByTestId} = renderDialog({tier: TIERS.FREE, isOpen: true, onClose})
    fireEvent.click(getByTestId('button-quota-subscribe'))
    expect(onClose).toHaveBeenCalled()
    expect(goToSubscription).toHaveBeenCalledTimes(1)
    expect(goToSubscription).toHaveBeenCalledWith(expect.objectContaining({
      from: 'quota',
      stripeCustomerId: null,
      userEmail: 'free@test.com',
      getAccessTokenSilently: mockedUserLoggedIn.getAccessTokenSilently,
    }))
  })
})
