import React from 'react'
import {act, render} from '@testing-library/react'


// PerfToolbarSlot follows PerfMonitor's live visibility through
// `useSyncExternalStore(subscribePerf, isPerfVisible)`. The module is mocked
// (a real one would need `jest.resetModules`, which invalidates the React
// instance RTL captured at import) with a settable value and a listener set.
let mockIsPerfEnabled = false
const mockListeners = new Set()
const mockMountPerfPanel = jest.fn()
const mockUnmountPerfPanel = jest.fn()

jest.mock('../utils/PerfMonitor', () => ({
  isPerfVisible: () => mockIsPerfEnabled,
  subscribePerf: (fn) => {
    mockListeners.add(fn)
    return () => mockListeners.delete(fn)
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

  test('appears and mounts when the panel is shown at runtime (backtick)', () => {
    mockIsPerfEnabled = false
    const {container} = render(<PerfToolbarSlot/>)
    expect(container.firstChild).toBeNull()
    act(() => {
      mockIsPerfEnabled = true
      mockListeners.forEach((fn) => fn())
    })
    expect(container.querySelector('[data-testid="perf-toolbar-slot"]')).not.toBeNull()
    expect(mockMountPerfPanel).toHaveBeenCalledTimes(1)
    act(() => {
      mockIsPerfEnabled = false
      mockListeners.forEach((fn) => fn())
    })
    expect(container.firstChild).toBeNull()
    expect(mockUnmountPerfPanel).toHaveBeenCalledTimes(1)
  })
})
