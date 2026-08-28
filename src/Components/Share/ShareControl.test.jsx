/* eslint-disable no-magic-numbers */
import React from 'react'
import {act, fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import ShareControl from './ShareControl'
import {ColorMode} from '../../viewer/display/colorMode'
import {ShadingMode} from '../../viewer/display/shadingMode'
import {DEFAULT_COLOR} from '../../viewer/ifc/flatMeshToBatchedModel'


describe('ShareControl', () => {
  let controlButton
  let findByTestId
  describe('no cutplanes active', () => {
    beforeEach(async () => {
      const {findByTestId: fbti} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
      findByTestId = fbti
      controlButton = await findByTestId('control-button-share')
    })

    it('Renders', () => expect(controlButton).toBeInTheDocument())

    describe('Click ShareControl', () => {
      beforeEach(() => fireEvent.click(controlButton))

      it('Has controls and page title updated', async () => {
        expect(await findByTestId('img-qrcode')).toBeInTheDocument()
        expect(await findByTestId('textfield-link')).toBeInTheDocument()
        expect(await findByTestId('toggle-camera')).toBeInTheDocument()
        await(waitFor(() => expect(document.title).toBe('Share Model')))
      })
    })
  })


  describe('Cutplanes active', () => {
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


describe('ShareDialog display-settings toggle', () => {
  const grey = () => ({x: DEFAULT_COLOR.x, y: DEFAULT_COLOR.y, z: DEFAULT_COLOR.z, w: 1})

  /**
   * A colorless batched-model double — enough for `resolvedAppearance` to
   * report that this model offers both a color and a shading choice, which is
   * what lets those axes reach the token.
   *
   * @return {object} model double
   */
  const displayableModel = () => ({
    isBatchedMesh: true,
    instanceSourceColors: [grey(), grey(), grey()],
    instanceColors: [grey(), grey(), grey()],
    instanceParents: [11, 12, 20],
    instanceGeometryIds: [500, 500, 600],
    material: {wireframe: false},
    userData: {},
    setColorAt: jest.fn(),
  })

  /**
   * Open the dialog with a loaded model and a non-default Display menu state
   * in the store — what ResidencyControl would have written when the user
   * made the choice.
   *
   * @return {Promise<Function>} findByTestId for the open dialog
   */
  async function openWithDisplayOverride() {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModel(displayableModel())
      result.current.setDisplayOverride({kind: 'model'}, {
        color: ColorMode.SOURCE,
        shading: ShadingMode.WIREFRAME,
        residency: {percent: 40},
      })
    })
    const {findByTestId} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(await findByTestId('control-button-share'))
    return findByTestId
  }

  afterEach(async () => {
    window.location.hash = ''
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModel(null)
      result.current.resetDisplayOverrides()
    })
  })

  it('is on by default, so the link carries the #d: token', async () => {
    const findByTestId = await openWithDisplayOverride()
    expect((await findByTestId('toggle-display')).querySelector('input').checked).toBe(true)
    expect(window.location.hash).toContain('d:')
    expect(window.location.hash).toContain('color=src')
    expect(window.location.hash).toContain('wire=1')
    expect(window.location.hash).toContain('res=40')
  })

  it('strips the token when switched off and restores it when back on', async () => {
    const findByTestId = await openWithDisplayOverride()
    const toggle = (await findByTestId('toggle-display')).querySelector('input')

    fireEvent.click(toggle)
    expect(window.location.hash).not.toContain('d:')
    // The URL the dialog shows has to be the URL that gets copied, so the
    // strip must land before the re-render, not in an effect after it.
    expect((await findByTestId('textfield-link')).querySelector('textarea').value)
      .not.toContain('d:')

    fireEvent.click(toggle)
    expect(window.location.hash).toContain('color=src')
  })

  it('leaves other hash tokens alone', async () => {
    window.location.hash = '#c:1,2,3,4,5,6'
    const findByTestId = await openWithDisplayOverride()
    fireEvent.click((await findByTestId('toggle-display')).querySelector('input'))
    expect(window.location.hash).toContain('c:1,2,3,4,5,6')
  })

  it('adds no token for a model with a default display', async () => {
    // The invariant that keeps the common share link short: on by default
    // still means nothing is added when there is nothing to say. This model
    // is in the state a colorless one actually loads in — palette applied,
    // shaded, fully resident — so every axis is at its default.
    const painted = displayableModel()
    painted.instanceColors = [
      {x: 0.9, y: 0.1, z: 0.1, w: 1},
      {x: 0.1, y: 0.9, z: 0.1, w: 1},
      {x: 0.1, y: 0.1, z: 0.9, w: 1},
    ]
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModel(painted)
    })
    const {findByTestId} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(await findByTestId('control-button-share'))
    expect(await findByTestId('toggle-display')).toBeInTheDocument()
    expect(window.location.hash).not.toContain('d:')
  })
})
