import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'


// Mock Dialog to expose an action button and render children
jest.mock('./Dialog', () => ({
  __esModule: true,
  default: ({headerText, actionTitle, actionCb, children}) => (
    <div>
      <h1 data-testid='dialog-header'>{headerText}</h1>
      <button data-testid='dialog-action' onClick={actionCb}>{actionTitle}</button>
      <div data-testid='dialog-body'>{children}</div>
    </div>
  ),
}))

// Mock trackAlert to assert it is called
jest.mock('../utils/alertTracking', () => ({
  trackAlert: jest.fn(),
}))

// Helper to mock zustand store selector
const makeUseStoreMock = (state) => jest.fn((selector) => selector(state))

describe('AlertDialog', () => {
  let originalLocation

  beforeAll(() => {
    // Make window.location.href writable for assertions
    originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {href: ''},
    })
  })

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('renders title, description (markdown) and calls trackAlert', async () => {
    const {trackAlert} = await import('../utils/alertTracking')
    const alert = {
      name: 'LoadError',
      title: 'Failed to load model',
      description: 'Please see [docs](https://example.com) for help.',
      actionTitle: 'Reset',
      actionUrl: '/',
    }

    jest.doMock('../store/useStore', () => ({
      __esModule: true,
      default: makeUseStoreMock({
        alert,
        setAlert: jest.fn(),
      }),
    }))

    const AlertDialog = (await import('./AlertDialog')).default
    render(<AlertDialog onClose={() => {}}/>)

    expect(screen.getByTestId('dialog-header')).toHaveTextContent('Failed to load model')
    const link = await screen.findByRole('link', {name: 'docs'})
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')

    expect(trackAlert).toHaveBeenCalledWith('LoadError', alert)
  })

  test('clicking action clears alert and navigates to actionUrl (default /)', async () => {
    const setAlert = jest.fn()
    // Omit actionUrl to exercise default '/'
    const alert = {
      name: 'AnyError',
      title: 'Error',
      description: 'Something happened',
      actionTitle: 'Reset',
    }

    jest.doMock('../store/useStore', () => ({
      __esModule: true,
      default: makeUseStoreMock({
        alert,
        setAlert,
      }),
    }))

    const AlertDialog = (await import('./AlertDialog')).default
    render(<AlertDialog onClose={() => {}}/>)

    fireEvent.click(screen.getByTestId('dialog-action'))

    expect(setAlert).toHaveBeenCalledWith(null)
    expect(window.location.href).toBe('/')
  })
})
