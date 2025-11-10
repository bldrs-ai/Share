import React from 'react'
import '@testing-library/jest-dom'
import {act, fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../Share.fixture'
import AlertDialog from './AlertDialog'
import useStore from '../store/useStore'
import {OutOfMemoryError} from '../Alerts'


// Mock trackAlert to assert it is called
jest.mock('../utils/alertTracking', () => ({
  trackAlert: jest.fn(),
}))

// Mock useNavigate to track navigation calls
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

describe('AlertDialog', () => {
  let locationGetter

  beforeEach(() => {
    const mockLocation = {
      replace: jest.fn(),
    }
    locationGetter = jest.spyOn(window, 'location', 'get').mockReturnValue(mockLocation)
    mockNavigate.mockClear()
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


  test('AlertDialog appears when alert is set with string error', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAlert('Test error message')
    })

    const cb = jest.fn()
    const {getByRole, getByText, getByTestId} = render(<AlertDialog onClose={cb}/>, {wrapper: HelmetStoreRouteThemeCtx})

    const dialog = getByRole('dialog')
    expect(dialog).toBeVisible()
    expect(getByRole('heading', {name: 'Error'})).toBeVisible()
    expect(getByText('Test error message')).toBeVisible()
    expect(getByTestId('button-dialog-main-action')).toBeVisible()
    expect(getByTestId('button-dialog-main-action')).toHaveTextContent('Reset')
  })


  test('AlertDialog can be closed via close button', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAlert('Test error message')
    })

    const cb = jest.fn()
    const {getByRole, getByTestId, queryByRole} = render(<AlertDialog onClose={cb}/>, {wrapper: HelmetStoreRouteThemeCtx})

    const dialog = getByRole('dialog')
    expect(dialog).toBeVisible()

    fireEvent.click(getByTestId('button-close-dialog-error'))
    await waitFor(() => {
      expect(queryByRole('dialog')).not.toBeInTheDocument()
    })
  })


  test('AlertDialog can be closed via Reset button', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAlert('Test error message')
    })

    const cb = jest.fn()
    const {getByRole, getByTestId, queryByRole} = render(<AlertDialog onClose={cb}/>, {wrapper: HelmetStoreRouteThemeCtx})

    const dialog = getByRole('dialog')
    expect(dialog).toBeVisible()

    fireEvent.click(getByTestId('button-dialog-main-action'))
    await waitFor(() => {
      expect(queryByRole('dialog')).not.toBeInTheDocument()
    })
  })


  test('AlertDialog showing a specific OOM alert, from WASM alloc issue, with Reset button', async () => {
    const description = 'WASM memory allocation failed'
    const oomError = new OutOfMemoryError(description)

    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAlert(oomError)
    })

    const cb = jest.fn()
    const {getByRole, getByTestId} = render(<AlertDialog onClose={cb}/>, {wrapper: HelmetStoreRouteThemeCtx})

    const dialog = getByRole('dialog')
    expect(dialog).toBeVisible()
    expect(getByRole('heading', {name: 'Out of Memory'})).toBeVisible()
    expect(dialog).toHaveTextContent(description)
    expect(getByTestId('button-dialog-main-action')).toHaveTextContent('Reset')
    expect(getByTestId('button-close-dialog-out-of-memory')).toBeVisible()
  })


  test('AlertDialog navigates to default route when closed', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAlert('Test error message')
    })

    const cb = jest.fn()
    const {getByRole, getByTestId, queryByRole} = render(<AlertDialog onClose={cb}/>, {wrapper: HelmetStoreRouteThemeCtx})

    const dialog = getByRole('dialog')
    expect(dialog).toBeVisible()

    fireEvent.click(getByTestId('button-dialog-main-action'))
    await waitFor(() => {
      expect(queryByRole('dialog')).not.toBeInTheDocument()
    })
    // Should navigate to default route (/) via window.location.replace
    expect(window.location.replace).toHaveBeenCalledWith('/')
  })


  test('AlertDialog handles plain Error object with message property', async () => {
    const plainError = new Error('Plain error message')

    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAlert(plainError)
    })

    const cb = jest.fn()
    const {getByRole, getByText} = render(<AlertDialog onClose={cb}/>, {wrapper: HelmetStoreRouteThemeCtx})

    const dialog = getByRole('dialog')
    expect(dialog).toBeVisible()
    expect(getByText('Plain error message')).toBeVisible()
  })


  test('AlertDialog handles Error object with description property', async () => {
    const errorWithDescription = {
      name: 'CustomError',
      title: 'Custom Error',
      description: 'Custom error description',
    }

    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAlert(errorWithDescription)
    })

    const cb = jest.fn()
    const {getByRole, getByText} = render(<AlertDialog onClose={cb}/>, {wrapper: HelmetStoreRouteThemeCtx})

    const dialog = getByRole('dialog')
    expect(dialog).toBeVisible()
    expect(getByText('Custom error description')).toBeVisible()
  })
})
