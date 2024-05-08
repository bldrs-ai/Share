import React from 'react'
import {fireEvent, render, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx, RouteThemeCtx} from '../../Share.fixture'
import ImagineControl from './ImagineControl'


// ImagineControl uses viewer's screenshot
jest.mock('web-ifc-viewer')


describe('ImagineControl', () => {
  it('ControlButton visible', () => {
    const {getByTitle} = render(<ImagineControl/>, {wrapper: RouteThemeCtx})
    const component = getByTitle('Rendering')
    expect(component).toBeInTheDocument()
  })

  it('updates the title when the dialog is open', async () => {
    const {getByTitle} = render(<ImagineControl/>, {wrapper: HelmetStoreRouteThemeCtx})

    const button = getByTitle('Rendering')
    fireEvent.click(button)

    await(waitFor(() => expect(document.title).toBe('Imagine')))
  })
})
