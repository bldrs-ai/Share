import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import AlertAndSnackbar from './AlertDialogAndSnackbar'


/**
 * Every emitted CSS rule that targets one of an element's emotion classes,
 * media queries included — jsdom's getComputedStyle can't see either.
 *
 * @param {Element} element
 * @return {string}
 */
function cssOf(element) {
  const classes = Array.from(element.classList).filter((name) => name.startsWith('css-'))
  return Array.from(document.querySelectorAll('style'))
    .flatMap((style) => style.textContent.split('\n'))
    .filter((rule) => classes.some((name) => rule.includes(`.${name}`)))
    .join('\n')
}


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

  it('widens the content box when the report is expanded', () => {
    render(<ShareMock><AlertAndSnackbar/></ShareMock>)
    act(() => {
      useStore.getState().setLoadReportLines(['Model: Arty_Z7.stp — AP214, 38.1 MB'])
      useStore.getState().setLoadResult({status: 'success', summaryLine: 'Loaded Arty_Z7.stp'})
    })
    const content = document.querySelector('[data-testid="snackbar"] .MuiSnackbarContent-root')
    // Read the emitted rules rather than getComputedStyle: jsdom drops
    // `fit-content` as an unsupported width and never applies media queries,
    // so both bands are only visible in the stylesheet emotion inserted.
    expect(cssOf(content)).toContain('max-width:94vw')

    fireEvent.click(screen.getByTestId('LoadStatusExpandToggle'))
    const expandedCss = cssOf(content)
    // Mobile band (base declarations) — edge to edge.
    expect(expandedCss).toContain('min-width:100%')
    expect(expandedCss).toContain('max-width:100%')
    // Desktop band (sm and up) — half the viewport at least, four fifths at most.
    expect(expandedCss).toMatch(/@media \(min-width:600px\)[^}]*min-width:50vw/)
    expect(expandedCss).toMatch(/@media \(min-width:600px\)[^}]*max-width:80vw/)
    // The message slot grows with the box, or the extra width is dead space.
    expect(expandedCss).toMatch(/MuiSnackbarContent-message\{[^}]*flex-grow:1/)
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
