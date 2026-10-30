import React from 'react'
import {fireEvent, render, waitFor} from '@testing-library/react'
import {ThemeCtx} from '../theme/Theme.fixture'
import GatedAction from './GatedAction'


/**
 * @param {object} [props] Overrides
 * @return {object} A gated button element, with a plain button after it so
 *   the tab order through the gate is observable
 */
function aGate(props = {}) {
  return (
    <>
      <GatedAction
        slug='save'
        title='Log in to save'
        body='Log in to one of your connectors to save models'
        actionLabel='Log in'
        onAction={() => {}}
        {...props}
      >
        <button type='button' onClick={props.childOnClick || (() => {})} data-testid='inner-button'>Save</button>
      </GatedAction>
      <button type='button' data-testid='next-control'>Next</button>
    </>
  )
}


/**
 * Everything the browser would stop at while tabbing forward, in document
 * order. `tabIndex` is negative for anything explicitly taken out of the tab
 * order, which is the property under test.
 *
 * @param {HTMLElement} container Rendered tree
 * @return {Array<HTMLElement>} the tab stops
 */
function tabStops(container) {
  return Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]'))
    .filter((element) => element.tabIndex >= 0 && !element.disabled)
}


describe('GatedAction', () => {
  it('looks disabled without being disabled', () => {
    const {getByTestId} = render(aGate(), {wrapper: ThemeCtx})

    expect(getByTestId('gated-save')).toHaveAttribute('aria-disabled', 'true')
    // The DOM attribute is what would swallow the click, so it must be absent
    // on the control itself as well as on the wrapper.
    expect(getByTestId('inner-button')).not.toBeDisabled()
  })

  it('opens the help on click instead of running the action', () => {
    const childOnClick = jest.fn()
    const {getByTestId, queryByTestId} = render(aGate({childOnClick}), {wrapper: ThemeCtx})

    expect(queryByTestId('gated-help')).toBeNull()
    fireEvent.click(getByTestId('gated-save'))

    expect(getByTestId('gated-help')).toBeInTheDocument()
    expect(childOnClick).not.toHaveBeenCalled()
  })

  it('opens the help from the keyboard', () => {
    const {getByTestId} = render(aGate(), {wrapper: ThemeCtx})

    fireEvent.keyDown(getByTestId('gated-save'), {key: 'Enter'})

    expect(getByTestId('gated-help')).toBeInTheDocument()
  })

  it('leaves the gated control out of the tab order, so only the wrapper is a stop', () => {
    // `pointer-events: none` is a mouse-only defence: a keyboard user who
    // could Tab onto the control behind the gate and press Enter would have
    // the browser dispatch a click straight to it, running the handler the
    // gate exists to hold back (#1838).
    const {container, getByTestId} = render(aGate(), {wrapper: ThemeCtx})

    expect(getByTestId('inner-button')).toHaveAttribute('tabindex', '-1')
    expect(tabStops(container)).toEqual([getByTestId('gated-save'), getByTestId('next-control')])
  })

  it('opens the help rather than acting when a click reaches the child anyway', () => {
    // What Enter on a focused button does IS a click dispatched on that
    // button — it doesn't go through hit-testing, so `pointer-events: none`
    // never sees it. Same for a programmatic `.click()`.
    const childOnClick = jest.fn()
    const onOpen = jest.fn()
    const {getByTestId} = render(aGate({childOnClick, onOpen}), {wrapper: ThemeCtx})

    fireEvent.click(getByTestId('inner-button'))

    expect(childOnClick).not.toHaveBeenCalled()
    expect(getByTestId('gated-help')).toBeInTheDocument()
    // The wrapper's handler must not fire a second time on the way up: the
    // funnel counts one gate encounter, not two.
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('fires the unlocking action from the help, then closes it', async () => {
    const onAction = jest.fn()
    const {getByTestId, queryByTestId} = render(aGate({onAction}), {wrapper: ThemeCtx})

    fireEvent.click(getByTestId('gated-save'))
    fireEvent.click(getByTestId('gated-help-action'))

    expect(onAction).toHaveBeenCalled()
    // The Popover unmounts on the far side of its fade-out transition.
    await waitFor(() => expect(queryByTestId('gated-help')).toBeNull())
  })

  it('reports the help opening, for the funnel', () => {
    const onOpen = jest.fn()
    const {getByTestId} = render(aGate({onOpen}), {wrapper: ThemeCtx})

    fireEvent.click(getByTestId('gated-save'))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('offers no second action unless given one', () => {
    const {getByTestId, queryByTestId} = render(aGate(), {wrapper: ThemeCtx})
    fireEvent.click(getByTestId('gated-save'))
    expect(queryByTestId('gated-help-secondary-action')).toBeNull()
  })

  it('fires the secondary action from the help, then closes it', async () => {
    const onAction = jest.fn()
    const onSecondaryAction = jest.fn()
    const {getByTestId, queryByTestId} = render(
      aGate({onAction, secondaryActionLabel: 'Sign in', onSecondaryAction}), {wrapper: ThemeCtx})

    fireEvent.click(getByTestId('gated-save'))
    const secondary = getByTestId('gated-help-secondary-action')
    expect(secondary).toHaveTextContent('Sign in')
    fireEvent.click(secondary)

    expect(onSecondaryAction).toHaveBeenCalledTimes(1)
    expect(onAction).not.toHaveBeenCalled()
    await waitFor(() => expect(queryByTestId('gated-help')).toBeNull())
  })

  it('renders extra content in the help, and a click inside it leaves the help open', () => {
    const onExtraClick = jest.fn()
    const extra = <button type='button' onClick={onExtraClick} data-testid='extra'>Coming soon</button>
    const {getByTestId} = render(aGate({extra}), {wrapper: ThemeCtx})

    fireEvent.click(getByTestId('gated-save'))
    fireEvent.click(getByTestId('extra'))

    expect(onExtraClick).toHaveBeenCalledTimes(1)
    expect(getByTestId('gated-help')).toBeInTheDocument()
  })
})
