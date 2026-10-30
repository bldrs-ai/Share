import React from 'react'
import {act, render} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../Share.fixture'
import {EngineOpenFailureError} from '../loader/engineOpenFailure'
import {gtagEvent} from '../privacy/analytics'
import useStore from '../store/useStore'
import AlertDialog from './AlertDialog'


// Real alertTracking underneath: only the GA transport is replaced, so what
// the dialog hands GA is what is asserted. (AlertDialog.test.jsx mocks
// alertTracking itself and so cannot see this.)
jest.mock('../privacy/analytics', () => ({gtagEvent: jest.fn()}))
jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


describe('AlertDialog — engineFailure never sends the engine\'s reason to GA', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    act(() => {
      useStore.getState().setAlert(null)
    })
    console.error.mockRestore?.()
  })

  it('carries none of the reason text in any GA event', () => {
    const err = new EngineOpenFailureError(-1, 'OPEN_FAIL', 'unrecognized FILE_SCHEMA SECRET_CLIENT_SCHEMA')
    act(() => {
      useStore.getState().setAlert({type: 'engineFailure', message: err.alertMessage})
    })
    const {container} = render(<AlertDialog onClose={() => {}}/>, {wrapper: StoreRouteThemeCtx})
    // The user does see it…
    expect(container.ownerDocument.body.textContent).toContain('SECRET_CLIENT_SCHEMA')
    // …GA does not.
    expect(gtagEvent).toHaveBeenCalled()
    expect(JSON.stringify(gtagEvent.mock.calls)).not.toContain('SECRET_CLIENT_SCHEMA')
    expect(JSON.stringify(gtagEvent.mock.calls)).not.toContain('FILE_SCHEMA')
  })
})
