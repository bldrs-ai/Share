import React from 'react'
import {fireEvent, render, waitFor} from '@testing-library/react'
import ImagineControl from './ImagineControl'
import {MockComponent} from '../__mocks__/MockComponent'


describe('ImagineControl', () => {
  it('renders the dialog in the document', () => {
    const {getByTitle, debug} = render(<ImagineControl/>, {
      wrapper: MockComponent,
    })
    debug()
    const component = getByTitle('Bldr Bot Rendering')
    expect(component).toBeInTheDocument()
  })

  it('updates the title when the dialog is open', async () => {
    const {getByTitle, debug} = render(<ImagineControl/>, {
      wrapper: MockComponent,
    })

    const button = getByTitle('Bldr Bot Rendering')
    fireEvent.click(button)
    debug()
    await(waitFor(() => expect(document.title).toBe('BLDR Bot')))
  })
})
