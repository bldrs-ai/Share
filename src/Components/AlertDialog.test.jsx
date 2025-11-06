import React from 'react'
import '@testing-library/jest-dom'
import {act, fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../Share.fixture'
import AlertDialog from './AlertDialog'
import useStore from '../store/useStore'


// Mock trackAlert to assert it is called
jest.mock('../utils/alertTracking', () => ({
  trackAlert: jest.fn(),
}))

describe('AlertDialog', () => {
  let locationGetter

  beforeEach(() => {
    const mockLocation = {
      replace: jest.fn(),
    }
    locationGetter = jest.spyOn(window, 'location', 'get').mockReturnValue(mockLocation)
  })

  afterEach(() => {
    if (locationGetter) {
      locationGetter.mockRestore()
    }
  })

  test('renders title, description (markdown) and calls trackAlert', async () => {
    const {trackAlert} = await import('../utils/alertTracking')
    const alert = {
      name: 'LoadError',
      title: 'Failed to load model',
      description: 'Please see [docs](https://example.com) for help.',
    }
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAlert(alert)
    })

    const cb = jest.fn()
    const {getByRole, getByTestId} = render(<AlertDialog onClose={cb}/>, {wrapper: HelmetStoreRouteThemeCtx})

    expect(trackAlert).toHaveBeenCalledWith(alert.name, alert)

    await waitFor(() => expect(document.title).toBe('Error'))

    const dialog = getByRole('dialog')
    expect(dialog).toHaveTextContent(alert.title)

    fireEvent.click(getByTestId('button-dialog-main-action'))
    expect(window.location.replace).toHaveBeenCalledWith('/')
  })
})
