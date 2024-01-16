import React from 'react'
import {fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import {HelmetProvider} from 'react-helmet-async'
import ShareControl from './ShareControl'
import useStore from '../store/useStore'


/**
 * ShareControl has a modal dialog that sets title, so need HelmetProvider.
 *
 * @return {React.Component}
 */
function TestComponent() {
  return <HelmetProvider><ShareControl/></HelmetProvider>
}


describe('ShareControl', () => {
  it('renders the dialog in the document', () => {
    const {getByRole} = render(<TestComponent/>)
    const controlButton = getByRole('button')
    expect(controlButton).toBeInTheDocument()
  })


  it('updates the title when the dialog is open', async () => {
    const {result} = renderHook(() => useStore((state) => state.setViewer))
    result.current({
      clipper: {
        planes: [],
      },
    })

    const {getByRole, queryByTestId} = render(<TestComponent/>)
    const button = getByRole('button')
    fireEvent.click(button)

    await(waitFor(() => expect(document.title).toBe('Share the model')))

    const qrcode = queryByTestId('qrcode')
    expect(qrcode).toBeInTheDocument()
  })


  it('renders QRCode component', () => {
    // Render the ShareControl component
    const {getByRole, queryByTestId} = render(<TestComponent/>)

    // The ShareDialog is not open by default, so we'll need to simulate it being opened
    const shareButton = getByRole('button')
    fireEvent.click(shareButton)

    const qrcode = queryByTestId('qrcode')
    expect(qrcode).toBeInTheDocument()
  })
})
