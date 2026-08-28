/* eslint-disable no-magic-numbers */
import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import ResidencyControl from './ResidencyControl'
import {DEFAULT_COLOR} from '../../viewer/ifc/flatMeshToBatchedModel'
import {activeColorMode} from '../../viewer/display/colorMode'
import {activeShadingMode} from '../../viewer/display/shadingMode'


// Shading is behind ?feature=displayControls; the color section is not. Mock
// so a test can flip the flag without a real URL param.
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
  // Default: displayControls OFF (so the color section is exercised in
  // isolation — shading is hidden). Shading tests flip it on explicitly.
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
