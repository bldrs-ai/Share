import React from 'react'
import {fireEvent, render, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx, RouteThemeCtx} from '../../Share.fixture'
// ImagineControl uses the viewer's screenshot; load the Jest harness for
// its dep mocks before importing ImagineControl. Side-effect import of
// the harness by relative path — not `jest.mock(...)`, which would
// auto-mock the harness module itself instead of executing its factories.
import '../../../__mocks__/shareViewerTestHarness'
import ImagineControl from './ImagineControl'


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
