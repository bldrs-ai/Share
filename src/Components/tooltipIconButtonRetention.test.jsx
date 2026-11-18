import React, {useState} from 'react'
import v8 from 'v8'
import vm from 'vm'
import {act, fireEvent, render} from '@testing-library/react'
import {TooltipIconButton} from './Buttons'
import {ThemeCtx} from '../theme/Theme.fixture'
import QuestionIcon from '../assets/icons/Question.svg'


// TooltipIconButton must not keep the `onClick` of the render it mounted in
// once a later render hands it another (open-205 #2023). MUI's ButtonBase
// keeps its first render's handlers for its whole life, and those reach the
// first `onClick` — which, for a toolbar control's inline handler, holds that
// control's whole render scope: after an in-app model switch, the model left.
//
// The forced GC is V8's own, set up the way engineSourceRetention.test.js
// does (and for the same reasons): a WeakRef is cleared only by a GC that
// runs after the task that last dereferenced it, hence the awaits.
v8.setFlagsFromString('--expose-gc')
const gc = vm.runInNewContext('gc')
v8.setFlagsFromString('--no-expose-gc')


/** @return {Promise<void>} a turn of the event loop */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}


/**
 * @param {WeakRef} ref
 * @return {Promise<boolean>} whether the target was collected
 */
async function collected(ref) {
  for (let i = 0; i < 10; i++) {
    await tick()
    gc()
    if (ref.deref() === undefined) {
      return true
    }
  }
  return false
}


/**
 * A click handler that holds `held`, the way a control's inline handler
 * holds its render's model. Made in its own function so nothing else in this
 * file's scope keeps `held` alive.
 *
 * @param {object} held
 * @param {Array} calls
 * @return {Function}
 */
function handlerHolding(held, calls) {
  return () => calls.push(held.name)
}


/**
 * Holds the button's handler in state, so a test can swap it without the
 * element it rendered first keeping the first handler (RTL's `rerender`
 * closure keeps the first `ui` it was given).
 *
 * @property {object} control `control.setOnClick` is set to the state setter
 * @property {Array} calls the names each handler that ran pushes
 * @return {object}
 */
function Harness({control, calls}) {
  const [onClick, setOnClick] = useState(() => handlerHolding(control.makeFirst(), calls))
  control.setOnClick = setOnClick
  return (
    <TooltipIconButton
      title='Display'
      icon={<QuestionIcon/>}
      onClick={onClick}
      placement='top'
      dataTestId='retention-button'
    />
  )
}


describe('TooltipIconButton retention', () => {
  it('lets go of the first render\'s onClick once a later render replaces it', async () => {
    const calls = []
    let firstRef = null
    const control = {
      makeFirst: () => {
        const first = {name: 'first'}
        firstRef = new WeakRef(first)
        return first
      },
    }
    const {getByTestId} = render(<Harness control={control} calls={calls}/>, {wrapper: ThemeCtx})
    // Twice: React keeps the previous render's props on the fiber's
    // alternate until the render after, which would hold the first handler
    // with or without the fix.
    for (const name of ['second', 'third']) {
      act(() => control.setOnClick(() => handlerHolding({name}, calls)))
    }

    // The latest handler is the one that runs.
    fireEvent.click(getByTestId('retention-button'))
    expect(calls).toEqual(['third'])

    expect(await collected(firstRef)).toBe(true)
  })
})
