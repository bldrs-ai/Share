import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import AlertAndSnackbar from './AlertDialogAndSnackbar'


// Grace-period state machine (conway #301 UX). The shrink-to-"i" animation
// itself has no measurable target in jsdom (no LoadReportControl rendered
// here, and getBoundingClientRect is zeroed), so the success auto-dismiss
// falls through to the instant-clear path — which is exactly what we assert:
// the grace result is cleared once the timer fires. The manual paths (error
// waits for OK; expand cancels the timer) are the behavioral core.
describe('AlertAndSnackbar grace period', () => {
  const GRACE_MS = 5000
  const PAST_GRACE_MS = 6000

  beforeEach(() => {
    jest.useFakeTimers()
    act(() => {
      useStore.getState().setLoadResult(null)
      useStore.getState().setCurrentLoadLine(null)
      useStore.getState().setLoadReportLines([])
      useStore.getState().setModel(null)
    })
  })

  afterEach(() => {
    act(() => useStore.getState().setLoadResult(null))
    jest.useRealTimers()
  })

  it('shows the success summary with an OK action and auto-dismisses', () => {
    render(<ShareMock><AlertAndSnackbar/></ShareMock>)
    act(() => {
      useStore.getState().setLoadResult({status: 'success', summaryLine: 'Loaded index.ifc'})
    })
    expect(screen.getByTestId('LoadStatusLine').textContent).toBe('Loaded index.ifc')
    expect(screen.getByTestId('LoadStatusOk')).toBeInTheDocument()

    act(() => jest.advanceTimersByTime(PAST_GRACE_MS))
    expect(useStore.getState().loadResult).toBe(null)
  })

  it('an error line waits for OK — no auto-dismiss', () => {
    render(<ShareMock><AlertAndSnackbar/></ShareMock>)
    act(() => {
      useStore.getState().setLoadResult({status: 'error', summaryLine: 'Load failed: bad header'})
    })
    act(() => jest.advanceTimersByTime(PAST_GRACE_MS))
    // Still up after the grace window — errors never auto-dismiss.
    expect(useStore.getState().loadResult).not.toBe(null)

    fireEvent.click(screen.getByTestId('LoadStatusOk'))
    expect(useStore.getState().loadResult).toBe(null)
  })

  it('expanding during grace cancels the auto-dismiss; OK then dismisses', () => {
    render(<ShareMock><AlertAndSnackbar/></ShareMock>)
    act(() => {
      useStore.getState().setLoadResult({status: 'success', summaryLine: 'Loaded a.ifc'})
    })
    // Expand before the grace window elapses.
    fireEvent.click(screen.getByTestId('LoadStatusExpandToggle'))
    act(() => jest.advanceTimersByTime(PAST_GRACE_MS))
    // Auto-dismiss was cancelled — still up, waiting for the user.
    expect(useStore.getState().loadResult).not.toBe(null)

    fireEvent.click(screen.getByTestId('LoadStatusOk'))
    expect(useStore.getState().loadResult).toBe(null)
  })

  it('does not fire the grace timer before the window elapses', () => {
    render(<ShareMock><AlertAndSnackbar/></ShareMock>)
    act(() => {
      useStore.getState().setLoadResult({status: 'success', summaryLine: 'Loaded b.ifc'})
    })
    act(() => jest.advanceTimersByTime(GRACE_MS - 1))
    expect(useStore.getState().loadResult).not.toBe(null)
  })

  it('pads the live line bar to a fixed width, metrics following', () => {
    render(<ShareMock><AlertAndSnackbar/></ShareMock>)
    act(() => {
      useStore.getState().setCurrentLoadLine('Parsing [0%........98%] 1.114s, +89.034761 MB heap')
    })
    const line = screen.getByTestId('LoadStatusLine')
    expect(line.textContent).toContain('Parsing [0%')
    expect(line.textContent).toContain('1.114s, +89.034761 MB heap')
    // The bar is space-padded past "98%" so "]" holds a fixed column.
    expect(line.textContent).toMatch(/98% +\]/)
  })

  it('prefers the page-title model name for the success grace line', () => {
    render(<ShareMock><AlertAndSnackbar/></ShareMock>)
    act(() => {
      useStore.getState().setModel({name: 'Arty_Z7_PCB'})
      useStore.getState().setLoadResult({status: 'success', summaryLine: 'Loaded Arty_Z7.stp'})
    })
    // model.name wins over the reporter's filename fallback.
    expect(screen.getByTestId('LoadStatusLine').textContent).toBe('Loaded Arty_Z7_PCB')
  })
})
