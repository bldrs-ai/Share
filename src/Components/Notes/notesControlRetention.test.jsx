import React from 'react'
import {act, render} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import {isCollected} from '../../utils/gc.fixture'
import NotesControl from './NotesControl'


/**
 * Put a new model in the store, keeping only a WeakRef to it here.
 *
 * @return {Promise<WeakRef>}
 */
async function showNewModel() {
  const model = {name: 'a model'}
  await act(() => useStore.getState().setModel(model))
  return new WeakRef(model)
}


// open-205 (#2019): NotesControl's hashchange listener stays on `window` for
// the component's life (its effect's deps are stable setters). Made in the
// render, it kept that render's scope, and with it the `model` of the render
// NotesControl mounted in, across an in-app model switch.
describe('NotesControl retention (open-205, #2019)', () => {
  afterEach(async () => {
    await act(() => useStore.getState().setModel(null))
  })

  it('lets the model it mounted with go after a switch to another', async () => {
    await act(() => useStore.getState().setRepository('pablo-mayrgundter', 'Share'))
    const firstRef = await showNewModel()
    render(<ShareMock><NotesControl/></ShareMock>)

    // Twice: React keeps the previous render on a fiber's alternate until
    // the render after, with or without the fix.
    await showNewModel()
    await showNewModel()

    expect(await isCollected(firstRef)).toBe(true)
  })

  it('still selects the note a hashchange names', async () => {
    render(<ShareMock><NotesControl/></ShareMock>)
    await act(() => {
      window.location.hash = '#i:7'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(useStore.getState().selectedNoteId).toBe(7)
    window.location.hash = ''
  })
})
