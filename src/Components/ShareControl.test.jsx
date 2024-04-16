import React from 'react'
import {fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import ShareControl from './ShareControl'
import {HelmetStoreRouteThemeCtx} from '../Share.fixture'
import useStore from '../store/useStore'


describe('ShareControl', () => {
  let controlButton
  let findByTestId


  context('no cutplanes active', () => {
    beforeEach(async () => {
      const {findByTestId: fbti} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
      findByTestId = fbti
      controlButton = await findByTestId('control-button-share')
    })

    it('Renders', () => expect(controlButton).toBeInTheDocument())

    context('Click ShareControl', () => {
      beforeEach(() => fireEvent.click(controlButton))

      it('Has controls and page title updated', async () => {
        expect(await findByTestId('img-qrcode')).toBeInTheDocument()
        expect(await findByTestId('textfield-link')).toBeInTheDocument()
        expect(await findByTestId('toggle-camera')).toBeInTheDocument()
        await(waitFor(() => expect(document.title).toBe('Share Model')))
      })
    })
  })


  context('Cutplanes active', () => {
    beforeEach(async () => {
      const {result} = renderHook(() => useStore((state) => state.setIsCutPlaneActive))
      result.current(true)
      const {findByTestId: fbti} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
      findByTestId = fbti
      controlButton = await findByTestId('control-button-share')
      fireEvent.click(controlButton)
    })

    it('Includes cutplanes', async () => expect(await findByTestId('toggle-cutplane')).toBeInTheDocument())
  })
})
