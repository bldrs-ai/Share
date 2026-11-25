import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react'
import useStore from '../../store/useStore'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import AnonLimitDialog, {AnonLastFreeNotice} from './AnonLimitDialog'


describe('Open/AnonLimitDialog', () => {
  afterEach(() => {
    act(() => useStore.setState({anonMeterGate: null, anonMeterNotice: null, isLoginVisible: false}))
  })

  it('is closed with no gate', () => {
    render(<HelmetStoreRouteThemeCtx><AnonLimitDialog/></HelmetStoreRouteThemeCtx>)
    expect(screen.queryByTestId('anon-limit-dialog')).toBeNull()
  })

  it('says the period\'s free remote models are used and offers sign-in', () => {
    act(() => useStore.setState({anonMeterGate: {gatedBy: 'token', used: 2, limit: 2, periodEnd: '2026-12-25T09:00:00.000Z'}}))
    render(<HelmetStoreRouteThemeCtx><AnonLimitDialog/></HelmetStoreRouteThemeCtx>)
    expect(screen.getByTestId('anon-limit-text').textContent)
      .toMatch(/^You've opened your 2 free models from GitHub, Google Drive and links for this 30-day period, which ends /)
    fireEvent.click(screen.getByTestId('button-anon-limit-signin'))
    expect(useStore.getState().anonMeterGate).toBeNull()
    expect(useStore.getState().isLoginVisible).toBe(true)
  })

  it('says when it is the network\'s day cap', () => {
    act(() => useStore.setState({anonMeterGate: {gatedBy: 'ip', used: 1, limit: 2, periodEnd: null}}))
    render(<HelmetStoreRouteThemeCtx><AnonLimitDialog/></HelmetStoreRouteThemeCtx>)
    expect(screen.getByTestId('anon-limit-text').textContent).toMatch(/^This network has opened its free models/)
    fireEvent.click(screen.getByTestId('button-anon-limit-close'))
    expect(useStore.getState().anonMeterGate).toBeNull()
  })

  it('shows the last-free notice without blocking, with a sign-in', () => {
    act(() => useStore.setState({anonMeterNotice: {periodEnd: null}}))
    render(<HelmetStoreRouteThemeCtx><AnonLastFreeNotice/></HelmetStoreRouteThemeCtx>)
    expect(screen.getByTestId('anon-last-free-notice').textContent)
      .toMatch(/This was your last free model from GitHub, Google Drive or a link this period/)
    fireEvent.click(screen.getByTestId('button-anon-notice-signin'))
    expect(useStore.getState().anonMeterNotice).toBeNull()
    expect(useStore.getState().isLoginVisible).toBe(true)
  })
})
