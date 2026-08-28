/* eslint-disable no-magic-numbers */
import React from 'react'
import {Sphere, Vector3} from 'three'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import ResidencyControl from './ResidencyControl'
import {DEFAULT_COLOR} from '../../viewer/ifc/flatMeshToBatchedModel'
import {activeColorMode} from '../../viewer/display/colorMode'
import {activeShadingMode} from '../../viewer/display/shadingMode'
import {ResidencyMetric} from '../../viewer/residency/ResidencyController'


// ShareMock pulls in BaseRoutesMock, whose module-top `jest.mock('three')`
// Jest hoists over this whole file. Under that automock `Vector3.copy()`
// returns undefined and `ResidencyController`'s constructor throws on the
// first instance it walks, so the residency section could never render. Undo
// it for this file the same way ShareViewer.test.js does.
jest.mock('three', () => jest.requireActual('three'))

// Shading is gated on `displayControls`; the color section is not. The mock
// makes each test state the flag it means, independent of the shipped default
// — which is why flipping that default to true (the S7 landing) left every
// assertion here valid: the gate below is pinned in BOTH positions, and
// neither is claiming to be the default. The real default is covered by the
// E2E (`tests/e2e/shading.spec.ts`), which navigates with no `?feature=`.
const mockIsFeatureEnabled = jest.fn()
jest.mock('../../FeatureFlags', () => ({
  isFeatureEnabled: (name) => mockIsFeatureEnabled(name),
}))


const grey = () => ({x: DEFAULT_COLOR.x, y: DEFAULT_COLOR.y, z: DEFAULT_COLOR.z, w: 1})


/**
 * Batched-model double carrying the tables the color section reads. No
 * `instanceGeometry` / `setVisibleAt`, so `ResidencyController` finds nothing
 * to evict and the residency section stays hidden — which is exactly the case
 * that proves the color section gates independently.
 *
 * @param {Array<object>} sourceColors the file's own colors
 * @return {object} model double
 */
function colorOnlyModel(sourceColors = [grey(), grey(), grey()]) {
  return {
    isBatchedMesh: true,
    instanceSourceColors: sourceColors.map((c) => ({...c})),
    instanceColors: sourceColors.map((c) => ({...c})),
    instanceParents: [11, 12, 20],
    instanceGeometryIds: [500, 500, 600],
    material: {wireframe: false},
    userData: {},
    setColorAt: jest.fn(),
  }
}


/**
 * The colorOnlyModel double plus the tables `ResidencyController` needs to
 * find something to evict, so the residency section renders. Three instances
 * of increasing size at the origin.
 *
 * @return {object} model double
 */
function residencyModel() {
  const model = colorOnlyModel()
  model.instanceGeometry = [1, 2, 3].map((radius) => ({
    boundingSphere: new Sphere(new Vector3(), radius),
    getAttribute: () => ({count: radius * 100}),
  }))
  model.getMatrixAt = (index, matrix) => matrix.identity()
  model.setVisibleAt = jest.fn()
  return model
}


/**
 * Mount the control with a model in the store.
 *
 * @param {object|null} model
 * @return {object} testing-library render result
 */
async function renderWithModel(model) {
  const {result} = renderHook(() => useStore((state) => state))
  await act(() => {
    result.current.setModel(model)
  })
  return render(<ResidencyControl/>, {wrapper: ShareMock})
}


describe('ResidencyControl color section', () => {
  // Flag OFF for this suite so the color section is exercised in ISOLATION
  // (shading hidden) — a test-fixture choice, not a claim about the shipped
  // default, which is on. Shading tests flip it on explicitly.
  beforeEach(() => mockIsFeatureEnabled.mockReturnValue(false))
  afterEach(async () => {
    mockIsFeatureEnabled.mockReset()
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModel(null)
      result.current.resetDisplayOverrides()
    })
  })

  it('renders nothing when there is no model', async () => {
    const {queryByTestId} = await renderWithModel(null)
    expect(queryByTestId('control-button-residency')).toBeNull()
  })

  it('offers the color choice when the synthetic palette applies', async () => {
    const {getByTestId} = await renderWithModel(colorOnlyModel())
    fireEvent.click(getByTestId('control-button-residency'))
    expect(getByTestId('color-mode-group')).toBeInTheDocument()
  })

  it('discloses that Auto is Share-assigned, not from the file', async () => {
    const {getByTestId, getByText} = await renderWithModel(colorOnlyModel())
    fireEvent.click(getByTestId('control-button-residency'))
    // The label is the feature: without it the user can't tell that a
    // rainbow assembly was colored by us rather than by the file.
    expect(getByText('Auto (Share-assigned)')).toBeInTheDocument()
  })

  it('hides the color choice on a model that authored its own colors', async () => {
    const authored = colorOnlyModel([{x: 0.6, y: 0.576, z: 0.749, w: 1}, grey(), grey()])
    const {queryByTestId} = await renderWithModel(authored)
    // Nothing to disclose and nothing to toggle -> no button at all, since
    // this model gives the residency section nothing either.
    expect(queryByTestId('control-button-residency')).toBeNull()
  })

  it('repaints the scene when switched to Source', async () => {
    const model = colorOnlyModel()
    const {getByTestId} = await renderWithModel(model)
    fireEvent.click(getByTestId('control-button-residency'))

    // Load-time state here is Source (this double was never palette-painted),
    // so drive it to Auto and back to prove both directions reach the scene.
    fireEvent.click(getByTestId('color-mode-auto').querySelector('input'))
    expect(activeColorMode(model)).toBe('auto')
    expect(model.setColorAt).toHaveBeenCalled()

    fireEvent.click(getByTestId('color-mode-source').querySelector('input'))
    expect(activeColorMode(model)).toBe('source')
    expect(model.instanceColors).toEqual(model.instanceSourceColors)
  })
})


describe('ResidencyControl shading section', () => {
  afterEach(async () => {
    mockIsFeatureEnabled.mockReset()
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModel(null)
      result.current.resetDisplayOverrides()
    })
  })

  // The gate itself, not the default: `?feature=` can only turn flags on, so
  // this configuration is no longer reachable in the shipped app — it is here
  // to keep the gate honest for S5, which lands its scoped controls behind it.
  it('is hidden when displayControls is off', async () => {
    mockIsFeatureEnabled.mockReturnValue(false)
    const {getByTestId, queryByTestId} = await renderWithModel(colorOnlyModel())
    fireEvent.click(getByTestId('control-button-residency'))
    expect(queryByTestId('shading-mode-group')).toBeNull()
  })

  it('appears behind the flag and toggles wireframe on the scene', async () => {
    mockIsFeatureEnabled.mockImplementation((name) => name === 'displayControls')
    const model = colorOnlyModel()
    const {getByTestId} = await renderWithModel(model)
    fireEvent.click(getByTestId('control-button-residency'))

    expect(getByTestId('shading-mode-group')).toBeInTheDocument()
    expect(activeShadingMode(model)).toBe('shaded')

    fireEvent.click(getByTestId('shading-mode-wireframe').querySelector('input'))
    expect(model.material.wireframe).toBe(true)
    expect(activeShadingMode(model)).toBe('wireframe')

    fireEvent.click(getByTestId('shading-mode-shaded').querySelector('input'))
    expect(model.material.wireframe).toBe(false)
  })

  it('renders above the color section', async () => {
    // Ordering is a product decision, not an accident: wireframe changes what
    // you're looking at, color only tints it, so the coarser choice comes
    // first. Asserted because a JSX reshuffle would otherwise flip it silently.
    mockIsFeatureEnabled.mockImplementation((name) => name === 'displayControls')
    const {getByTestId} = await renderWithModel(colorOnlyModel())
    fireEvent.click(getByTestId('control-button-residency'))
    // Siblings, neither containing the other, so compareDocumentPosition is
    // exactly DOCUMENT_POSITION_FOLLOWING when color comes after shading.
    expect(getByTestId('shading-mode-group').compareDocumentPosition(getByTestId('color-mode-group')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})


describe('ResidencyControl residency section', () => {
  beforeEach(() => mockIsFeatureEnabled.mockReturnValue(false))
  afterEach(async () => {
    mockIsFeatureEnabled.mockReset()
    window.location.hash = ''
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModel(null)
      result.current.resetDisplayOverrides()
    })
  })

  it('writes the priority metric to the #d: token', async () => {
    const {getByTestId} = await renderWithModel(residencyModel())
    fireEvent.click(getByTestId('control-button-residency'))

    fireEvent.click(getByTestId('residency-metric-memory').querySelector('input'))
    // Full residency but a non-default metric: still a menu choice the user
    // made, so the link carries it (percent first, metric appended).
    expect(window.location.hash).toContain('res=100.memory')
  })

  it('restores percent AND metric from a #d: permalink on cold load', async () => {
    // The ordering case: the residency controller is built in its own effect,
    // so the override read out of the hash lands before there is anything to
    // apply it to. It has to take effect anyway once the controller appears.
    window.location.hash = '#d:res=40.memory'
    const model = residencyModel()
    const {getByTestId} = await renderWithModel(model)
    fireEvent.click(getByTestId('control-button-residency'))

    expect(getByTestId('residency-slider').querySelector('input').value).toBe('40')
    expect(getByTestId('residency-metric-memory').querySelector('input').checked).toBe(true)
    // Scene state, not just DOM state (design doc §8): instances were evicted.
    expect(model.setVisibleAt).toHaveBeenCalledWith(expect.any(Number), false)
  })

  it('leaves the token alone for a default-residency model', async () => {
    const {getByTestId} = await renderWithModel(residencyModel())
    fireEvent.click(getByTestId('control-button-residency'))
    // Untouched menu -> no `d:` token at all; the common share link stays as
    // short as it was before view-140.
    expect(window.location.hash).not.toContain('d:')
    expect(getByTestId('residency-metric-occupancy').querySelector('input').checked).toBe(true)
    expect(getByTestId('residency-slider').querySelector('input').value).toBe('100')
  })

  it('keeps the residency axis when another axis changes', async () => {
    // setDisplayOverride merges axes but not within one, so the color click
    // must not drop the residency term (or vice versa) from the token.
    window.location.hash = '#d:res=40.memory'
    const {getByTestId} = await renderWithModel(residencyModel())
    fireEvent.click(getByTestId('control-button-residency'))
    // This double loads showing source colors, so Auto is the move that
    // actually fires the radio; Source after it is the term we assert on.
    fireEvent.click(getByTestId('color-mode-auto').querySelector('input'))
    fireEvent.click(getByTestId('color-mode-source').querySelector('input'))

    expect(window.location.hash).toContain('res=40.memory')
    expect(window.location.hash).toContain('color=src')
  })

  it('exposes the metric through the store, not local state', async () => {
    const {getByTestId} = await renderWithModel(residencyModel())
    fireEvent.click(getByTestId('control-button-residency'))
    fireEvent.click(getByTestId('residency-metric-distance').querySelector('input'))

    const {result} = renderHook(() => useStore((state) => state.displayOverrides))
    expect(result.current.model.appearance.residency)
      .toEqual({percent: 100, metric: ResidencyMetric.DISTANCE})
  })
})
