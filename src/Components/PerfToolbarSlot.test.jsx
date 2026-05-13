import React from 'react'
import {render} from '@testing-library/react'


// PerfMonitor's `isPerfEnabled` is normally frozen at module load
// (reads `window.location.search`).  To exercise both flag states in
// the same suite without `jest.resetModules` — which invalidates the
// React instance RTL captured at import — we mock the module and use
// a getter so each access from PerfToolbarSlot resolves the live value.
let mockIsPerfEnabled = false
const mockMountPerfPanel = jest.fn()
const mockUnmountPerfPanel = jest.fn()

jest.mock('../utils/PerfMonitor', () => ({
  get isPerfEnabled() {
    return mockIsPerfEnabled
  },
  mountPerfPanel: (...args) => mockMountPerfPanel(...args),
  unmountPerfPanel: (...args) => mockUnmountPerfPanel(...args),
}))


// Require AFTER the mock is registered.
import PerfToolbarSlot from './PerfToolbarSlot'


describe('PerfToolbarSlot', () => {
  beforeEach(() => {
    mockIsPerfEnabled = false
    mockMountPerfPanel.mockReset()
    mockUnmountPerfPanel.mockReset()
  })

  test('renders null when ?feature=perf is absent', () => {
    mockIsPerfEnabled = false
    const {container} = render(<PerfToolbarSlot/>)
    // Slot returns null when the flag is off — the bottom bar's layout
    // is byte-for-byte identical to pre-PR.
    expect(container.firstChild).toBeNull()
  })

  test('does not call mountPerfPanel when the flag is off', () => {
    mockIsPerfEnabled = false
    render(<PerfToolbarSlot/>)
    expect(mockMountPerfPanel).not.toHaveBeenCalled()
  })

  test('renders the host Box and calls mountPerfPanel when the flag is on', () => {
    mockIsPerfEnabled = true
    const {container} = render(<PerfToolbarSlot/>)
    const slot = container.querySelector('[data-testid="perf-toolbar-slot"]')
    expect(slot).not.toBeNull()
    expect(mockMountPerfPanel).toHaveBeenCalledTimes(1)
    // The mount target should be the host Box itself.
    expect(mockMountPerfPanel).toHaveBeenCalledWith(slot)
  })

  test('calls unmountPerfPanel on unmount when the flag was on', () => {
    mockIsPerfEnabled = true
    const {unmount} = render(<PerfToolbarSlot/>)
    expect(mockUnmountPerfPanel).not.toHaveBeenCalled()
    unmount()
    expect(mockUnmountPerfPanel).toHaveBeenCalledTimes(1)
  })
})
