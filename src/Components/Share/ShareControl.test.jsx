/* eslint-disable no-magic-numbers */
import React from 'react'
import {act, fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../../__mocks__/authentication'
import {takeGateLoginSource} from '../../Auth0/gateLogin'
import {gtagEventWithCid} from '../../privacy/analytics'
import ShareControl, {
  MSG_LOCAL_SHARE_BODY,
  MSG_LOCAL_SHARE_TITLE,
  MSG_SHARE_COMING_SOON,
  MSG_SHARE_INTEREST_NOTED,
} from './ShareControl'
import {ColorMode} from '../../viewer/display/colorMode'
import {ShadingMode} from '../../viewer/display/shadingMode'
import {DEFAULT_COLOR} from '../../viewer/ifc/flatMeshToBatchedModel'


// Only the senders are stubbed, for the same reason as ExportSection.test.jsx:
// modules pulled in transitively read FUNNEL_EVENTS at import time.
// gtagEventWithCid attaches open_cid (privacy/analytics.test.js).
jest.mock('../../privacy/analytics', () => ({
  ...jest.requireActual('../../privacy/analytics'),
  gtagEvent: jest.fn(),
  gtagEventWithCid: jest.fn(),
}))


// ShareControl reads the auth state (the local-only gate's Sign in, and
// `signed_in` on its events). The mocked SDK hook returns undefined until
// given a value, so every suite starts signed out; cases that need a
// signed-in user set it themselves.
beforeEach(() => {
  mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
})


describe('ShareControl', () => {
  let controlButton
  let findByTestId
  let queryByTestId
  describe('no cutplanes active', () => {
    beforeEach(async () => {
      const {findByTestId: fbti, queryByTestId: qbti} = render(
        <ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
      findByTestId = fbti
      queryByTestId = qbti
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

      it('Has no Export section — export lives in the Save dialog', async () => {
        // Moved to Save → Export (#1838). Pinned here because the section
        // was in this dialog for two stages, and a stray re-add would give
        // the same flow two entry points with two histories.
        expect(await findByTestId('textfield-link')).toBeInTheDocument()
        expect(queryByTestId('export-section')).toBeNull()
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


/**
 * #705: a model opened from the user's computer lives only in this browser's
 * OPFS, so the link the Share dialog would hand out opens nowhere else. The
 * button stays in its slot, gated: a click explains and offers the Open
 * dialog instead of a link.
 */
describe('ShareControl for a local upload (#705)', () => {
  // Route provenance, as routes.ts#processFile produces it for
  // `/share/v/new/<id>` and Share.jsx stores it.
  const uploadedModelPath = {filepath: '/12345678-1234-4abc-9def-123456789abc.ifc', isUploadedFile: true}

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.setState({modelPath: uploadedModelPath, isShareVisible: false, isOpenModelVisible: false})
    })
  })

  afterEach(() => {
    act(() => {
      useStore.setState({modelPath: null, isShareVisible: false, isOpenModelVisible: false})
    })
  })

  it('renders the Share button gated, not as a dialog toggle', async () => {
    const {findByTestId, queryByTestId} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const gate = await findByTestId('gated-share')
    expect(gate).toHaveAttribute('aria-disabled', 'true')
    // Same test id as the live button, inside the gate, so selectors that
    // look for the toolbar's Share button still find it.
    expect(gate).toContainElement(await findByTestId('control-button-share'))
    expect(queryByTestId('textfield-link')).toBeNull()
  })

  it('explains why on click, without opening the Share dialog', async () => {
    const {findByTestId, findByText, queryByTestId} = render(
      <ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(await findByTestId('gated-share'))
    expect(await findByTestId('gated-help')).toBeInTheDocument()
    expect(await findByText(MSG_LOCAL_SHARE_TITLE)).toBeInTheDocument()
    expect(await findByText(MSG_LOCAL_SHARE_BODY)).toBeInTheDocument()
    expect(queryByTestId('textfield-link')).toBeNull()
    expect(queryByTestId('img-qrcode')).toBeNull()
    expect(useStore.getState().isShareVisible).toBe(false)
    expect(gtagEventWithCid).toHaveBeenCalledWith('share_gated', {reason: 'local_file', signed_in: false})
  })

  // Share#1964: the gate measures intent.
  it('counts one share_interest per opening, from the "coming soon" line', async () => {
    const {findByTestId, findByText, queryByTestId} = render(
      <ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(await findByTestId('gated-share'))
    expect(await findByText(MSG_SHARE_COMING_SOON)).toBeInTheDocument()

    fireEvent.click(await findByTestId('share-interest'))
    expect(gtagEventWithCid).toHaveBeenCalledWith('share_interest', {feature: 'save_to_cloud', signed_in: false})
    // A thank-you replaces the link, and the help stays open.
    expect(await findByText(MSG_SHARE_INTEREST_NOTED)).toBeInTheDocument()
    expect(queryByTestId('share-interest')).toBeNull()
    expect(await findByTestId('gated-help')).toBeInTheDocument()
    expect(gtagEventWithCid.mock.calls.filter(([name]) => name === 'share_interest')).toHaveLength(1)
  })

  it('offers a signed-out user Sign in, attributed to the gate', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {findByTestId} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(await findByTestId('gated-share'))
    const signIn = await findByTestId('gated-help-secondary-action')
    expect(signIn).toHaveTextContent('Sign in')

    fireEvent.click(signIn)
    expect(useStore.getState().isLoginVisible).toBe(true)
    expect(takeGateLoginSource()).toEqual({from: 'gate', feature: 'share'})
  })

  it('reports signed_in and offers no Sign in for a signed-in user', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId, queryByTestId} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(await findByTestId('gated-share'))
    expect(await findByTestId('gated-help')).toBeInTheDocument()
    expect(queryByTestId('gated-help-secondary-action')).toBeNull()
    expect(gtagEventWithCid).toHaveBeenCalledWith('share_gated', {reason: 'local_file', signed_in: true})
  })

  it('"Open a file" opens the Open dialog', async () => {
    const {findByTestId} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(await findByTestId('gated-share'))
    fireEvent.click(await findByTestId('gated-help-action'))
    expect(useStore.getState().isOpenModelVisible).toBe(true)
    expect(useStore.getState().isShareVisible).toBe(false)
  })

  // The dialog is visible-by-store-flag, and the flag is seeded from a
  // `#share:` hash at startup (UISlice#shareIsVisibleInitially). For an
  // upload the dialog isn't mounted at all, so that path can't show the
  // local link either.
  it('does not show the dialog even when the share flag is already set', async () => {
    act(() => {
      useStore.setState({isShareVisible: true})
    })
    const {findByTestId, queryByTestId} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(await findByTestId('gated-share')).toBeInTheDocument()
    expect(queryByTestId('textfield-link')).toBeNull()
  })

  // A hosted model NAMED `<uuid>.ifc` (`/share/v/p/` or GitHub) has a real,
  // portable URL. Only the route's provenance distinguishes it from an
  // upload; the loader's UUID-in-the-path heuristic can't.
  it('leaves a hosted UUID-named model shareable', async () => {
    act(() => {
      useStore.setState({modelPath: {...uploadedModelPath, isUploadedFile: false}})
    })
    const {findByTestId, queryByTestId} = render(<ShareControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(await findByTestId('control-button-share'))
    expect(await findByTestId('textfield-link')).toBeInTheDocument()
    expect(queryByTestId('gated-share')).toBeNull()
  })
})
