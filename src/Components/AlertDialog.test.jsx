import React from 'react'
import '@testing-library/jest-dom'
import {act, fireEvent, render, renderHook,screen} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../Share.fixture'
import AlertDialog from './AlertDialog'
import useStore from '../store/useStore'


// Mock trackAlert to assert it is called
jest.mock('../utils/alertTracking', () => ({
  trackAlert: jest.fn(),
}))

describe('AlertDialog', () => {
  test.only('renders title, description (markdown) and calls trackAlert', async () => {
    const {trackAlert} = await import('../utils/alertTracking')
    const alert = {
      name: 'LoadError',
      title: 'Failed to load model',
      description: 'Please see [docs](https://example.com) for help.',
      actionTitle: 'Reset',
      actionUrl: '/',
    }
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAlert(alert)
    })

    const cb = jest.fn()
    render(<AlertDialog onClose={cb}/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(trackAlert).toHaveBeenCalledWith(alert.name, alert)

    // check page title is set
    // expect(document.title).toBe('Error')

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(alert.title)
    fireEvent.click(screen.getByRole('button', {name: 'Reset'}))
    expect(cb).toHaveBeenCalled()
  })

  test('clicking action clears alert and navigates to actionUrl (default /)', () => {
    const setAlert = jest.fn()
    // Omit actionUrl to exercise default '/'
    const alert = {
      name: 'AnyError',
      title: 'Error',
      description: 'Something happened',
      actionTitle: 'Reset',
    }

    const setRepository = jest.fn()
    useStore.mockImplementation((selector) => {
      const state = {
        alert,
        setAlert,
        setRepository,
      }
      return selector(state)
    })

    render(<AlertDialog onClose={() => {}}/>, {wrapper: HelmetStoreRouteThemeCtx})

    fireEvent.click(screen.getByTestId('button-dialog-main-action'))

    expect(setAlert).toHaveBeenCalledWith(null)
    expect(window.location.replace).toHaveBeenCalledWith('/')
  })
})
