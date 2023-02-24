import React from 'react'
import {fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import ShareControl from './ShareControl'
import {MockComponent} from '../__mocks__/MockComponent'
import useStore from '../store/useStore'


describe('ShareControl', () => {
  it('renders the dialog in the document', () => {
    const {getByTitle} = render(<ShareControl/>, {
      wrapper: MockComponent,
    })
    const component = getByTitle('Share')
    expect(component).toBeInTheDocument()
  })

  it('updates the title when the dialog is open', async () => {
    const {result} = renderHook(() => useStore((state) => state.setViewerStore))
    result.current({
      clipper: {
        planes: [],
      },
    })

    const {getByTitle} = render(<ShareControl/>, {
      wrapper: MockComponent,
    })

    const button = getByTitle('Share')
    fireEvent.click(button)

    await(waitFor(() => expect(document.title).toBe('Share IFC Model — BLDRS')))
  })
})
