import React from 'react'
import {fireEvent, render, waitFor} from '@testing-library/react'
import ImagineControl from './ImagineControl'
import {MockComponent} from '../__mocks__/MockComponent'


describe('ImagineControl', () => {
  it('renders the dialog in the document', () => {
    const {getByTitle} = render(<ImagineControl/>, {
      wrapper: MockComponent,
    })
    const component = getByTitle('AI rendering')
    expect(component).toBeInTheDocument()
  })

  it('updates the title when the dialog is open', async () => {
    const {getByTitle} = render(<ImagineControl/>, {
      wrapper: MockComponent,
    })

    const button = getByTitle('AI rendering')
    fireEvent.click(button)
    await(waitFor(() => expect(document.title).toBe('AI Rendering — BLDRS')))
  })
})
