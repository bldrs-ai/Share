import React from 'react'
import {fireEvent, render, waitFor} from '@testing-library/react'
import {ThemeCtx} from '../theme/Theme.fixture'
import GatedAction from './GatedAction'


/**
 * @param {object} [props] Overrides
 * @return {object} A gated button element
 */
function aGate(props = {}) {
  return (
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
  )
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
})
