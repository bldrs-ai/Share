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
    show({tier: TIERS.PAID, isOpen: true})
    expect(limitEvents()).toHaveLength(1)

    // Close and reopen: a new showing.
    show({tier: TIERS.FREE, isOpen: false})
    show({tier: TIERS.FREE, isOpen: true})
    expect(limitEvents()).toHaveLength(2)
    expect(limitEvents()[1][2]).toEqual({tier: 'free', feature: 'private_load', open_cid: 'cid.111.222'})
  })

  // Its normalized twin: a private open (the tier model's "share") blocked,
  // with the dialog's tier, once per showing like the legacy event.
  it('sends model_share {blocked, hosted} beside quota_limit_reached', () => {
    setGaClientId('111.222')
    renderDialog({tier: TIERS.FREE, isOpen: true})
    const shares = window.gtag.mock.calls.filter(([kind, name]) => kind === 'event' && name === 'model_share')
    expect(shares).toEqual([['event', 'model_share', {
      tier: 'free', gate: 'blocked', source: 'hosted', open_cid: 'cid.111.222',
    }]])
  })

  // Share#1977: only a signed-in free user is metered, so `tier` is always
  // set in practice. If it ever isn't, the normalized event takes the
  // sign-in tier at emit time rather than reporting a signed-in user as anon.
  it('with no tier, model_share carries the signed-in user\'s sign-in tier, not anon', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    act(() => useStore.setState({isAuthResolved: true, authResolvedFor: true, appMetadata: {subscriptionStatus: 'sharePro'}}))
    await act(() => Promise.resolve(renderDialog({tier: undefined, isOpen: true})))
    const shares = window.gtag.mock.calls.filter(([kind, name]) => kind === 'event' && name === 'model_share')
    expect(shares.map(([, , params]) => params)).toEqual([expect.objectContaining({tier: 'pro', gate: 'blocked'})])
  })

  it('stays quiet while closed', () => {
    renderDialog({tier: TIERS.FREE, isOpen: false})
    expect(limitEvents()).toHaveLength(0)
  })

  // The free window is 7 days (owner, 2026-10-26; was 30). Only a signed-in
  // free user can be refused now (signed-out users are never metered), so
  // the anonymous tier's Sign up offer is gone.
  it('quotes the free limit as 2 private models in a rolling 7 days and offers no sign-up', () => {
    const {getByText, queryByTestId} = renderDialog({tier: TIERS.FREE, isOpen: true})
    expect(getByText(/limit of 2 private models in any rolling 7-day window/)).toBeInTheDocument()
    expect(queryByTestId('button-quota-signup')).toBeNull()
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

  // The assistant's wall (#1933): the same dialog, the tier's own words, and
  // the one quota_limit_reached for the condition, with no model-slot twin.
  describe('feature ai_credits', () => {
    const AI = 'ai_credits'

    it('sends one quota_limit_reached with the AI tier and feature, and no model_share', () => {
      renderDialog({tier: 'anonymous', isOpen: true, feature: AI})
      expect(limitEvents().map(([, , params]) => params)).toEqual([expect.objectContaining({tier: 'anonymous', feature: AI})])
      expect(window.gtag.mock.calls.filter(([, name]) => name === 'model_share')).toEqual([])
    })

    it('reportShowing false (a reopen the user asked for) sends nothing, and a later reported showing counts', () => {
      const {show} = renderDialog({tier: 'anonymous', isOpen: true, feature: AI, reportShowing: false})
      expect(limitEvents()).toHaveLength(0)
      show({tier: 'anonymous', isOpen: false, feature: AI})
      show({tier: 'anonymous', isOpen: true, feature: AI, reportShowing: true})
      expect(limitEvents()).toHaveLength(1)
    })

    it('signed out: offers Sign in, which closes and opens the login dialog', () => {
      act(() => useStore.setState({isLoginVisible: false}))
      const onClose = jest.fn()
      const {getByTestId, getByText, queryByTestId} = renderDialog({tier: 'anonymous', isOpen: true, feature: AI, onClose})
      expect(getByText('Out of assistant credits for today')).toBeInTheDocument()
      expect(queryByTestId('button-quota-subscribe')).toBeNull()
      expect(queryByTestId('button-quota-sign-in')).toHaveTextContent('Sign in')
      fireEvent.click(getByTestId('button-quota-sign-in'))
      expect(onClose).toHaveBeenCalled()
      expect(useStore.getState().isLoginVisible).toBe(true)
    })

    it('free: offers Upgrade to Pro through goToSubscription, and says nothing of private models', () => {
      mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
      const {getByTestId, queryByText} = renderDialog({tier: 'free', isOpen: true, feature: AI})
      expect(queryByText(/private models/)).toBeNull()
      expect(getByTestId('button-quota-subscribe')).toHaveTextContent('Upgrade to Pro')
      fireEvent.click(getByTestId('button-quota-subscribe'))
      expect(goToSubscription).toHaveBeenCalledWith(expect.objectContaining({from: 'quota'}))
    })

    it('Pro: only a wait, with Close and no call to action', () => {
      const {getByRole, queryByTestId, getByText} = renderDialog({tier: 'pro', isOpen: true, feature: AI})
      expect(getByText(/They come back as the days roll on/)).toBeInTheDocument()
      expect(queryByTestId('button-quota-subscribe')).toBeNull()
      expect(queryByTestId('button-quota-sign-in')).toBeNull()
      expect(getByRole('button', {name: 'Close'})).toBeInTheDocument()
    })
  })
})
