/* eslint-disable no-magic-numbers */
import React from 'react'
import {Sphere, Vector3} from 'three'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import nrrdToThree from '../../loader/nrrd'
import LiveDisplayLink from './LiveDisplayLink'
import ResidencyControl from './ResidencyControl'
import {HASH_DEBOUNCE_WAIT_MS} from '../../utils/debounce'
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
 * batch-geometry surface / `setVisibleAt`, so `ResidencyController` finds
 * nothing to evict and the residency section stays hidden — which is exactly
 * the case that proves the color section gates independently.
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
  const radii = [1, 2, 3]
  // The batch surface `ResidencyController` reads since Share#1810: one
  // geometry per instance, sized and bounded through three's own per-geometry
  // accessors instead of a retained `instanceGeometry` table.
  model.geometry = {attributes: {position: {}}, index: {}}
  model.getGeometryIdAt = (index) => index
  model.getGeometryRangeAt = (geometryId, target = {}) => {
    target.vertexStart = 0
    target.vertexCount = radii[geometryId] * 100
    target.indexStart = 0
    target.indexCount = radii[geometryId] * 100
    return target
  }
  model.getBoundingSphereAt = (geometryId, target) =>
    target.copy(new Sphere(new Vector3(), radii[geometryId]))
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
  // With the live view link's display term, as CadView mounts it: the menu
  // only notes the user's change, and the term writes `#d:` once it settles
  // (Share/viewLink.js).
  return render(<><ResidencyControl/><LiveDisplayLink/></>, {wrapper: ShareMock})
}


/** Let the live view link's debounced `#d:` write land. */
async function settleLink() {
  await act(() => new Promise((resolve) => setTimeout(resolve, HASH_DEBOUNCE_WAIT_MS + 20)))
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
    await settleLink()
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
    await settleLink()

    expect(window.location.hash).toContain('res=40.memory')
    expect(window.location.hash).toContain('color=src')
  })

  it('ranks occupancy from the viewer\'s camera, so a small part near the eye outranks a large far one', async () => {
    // The one case where occupancy and plain size disagree: instance 0 is the
    // smallest (r=1) but 2 from the eye; 1 and 2 (r=2, r=3) are 100 away. By
    // angular size 0 is the largest on screen (0.5 vs 0.02 / 0.03). With no
    // camera the metric falls back to radius alone and keeps 2 instead, which
    // is what shipped while this read `context.ifcCamera` — a field the
    // ThreeContext facade doesn't have.
    const model = residencyModel()
    const offsets = [new Vector3(0, 0, 2), new Vector3(0, 0, 100), new Vector3(0, 0, -100)]
    model.getMatrixAt = (index, matrix) => matrix.makeTranslation(offsets[index])
    const camera = {position: new Vector3(0, 0, 0)}
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setViewer({context: {getCamera: () => camera}})
    })
    try {
      // 34% of 3 instances rounds to one kept: the top of the ranking.
      window.location.hash = '#d:res=34'
      await renderWithModel(model)
      expect(model.setVisibleAt).not.toHaveBeenCalledWith(0, false)
      expect(model.setVisibleAt).toHaveBeenCalledWith(1, false)
      expect(model.setVisibleAt).toHaveBeenCalledWith(2, false)
    } finally {
      await act(() => {
        result.current.setViewer(null)
      })
    }
  })

  it('treats a disposed viewer\'s camera as none, instead of throwing out of a re-rank', async () => {
    // A disposed ThreeContext throws from getCamera (its legacy context is
    // gone); the store can still hold it until the next setViewer.
    const model = residencyModel()
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setViewer({context: {getCamera: () => {
        throw new TypeError('disposed')
      }}})
    })
    try {
      window.location.hash = '#d:res=34'
      await renderWithModel(model)
      // Ranked by size, as with no camera: the largest (2) is kept.
      expect(model.setVisibleAt).toHaveBeenCalledWith(0, false)
      expect(model.setVisibleAt).toHaveBeenCalledWith(1, false)
      expect(model.setVisibleAt).not.toHaveBeenCalledWith(2, false)
    } finally {
      await act(() => {
        result.current.setViewer(null)
      })
    }
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


describe('ResidencyControl while-moving section (motion residency)', () => {
  /**
   * A viewer context double: the seams MotionResidency attaches to.
   *
   * @return {object} viewer double with `context`
   */
  function viewerDouble() {
    const listeners = []
    return {
      context: {
        getCameraControls: () => ({
          addEventListener: (type, fn) => listeners.push([type, fn]),
          removeEventListener: () => undefined,
        }),
        onFrame: () => () => undefined,
        getRenderDemand: () => ({observePaints: () => () => undefined}),
        getRenderer: () => null,
      },
      listeners,
    }
  }

  /**
   * Motion residency is on by default; its only flag is the off switch, so
   * "off" is `disableMotionResidency` on. Both positions are pinned here, as
   * the Shading gate's are above; the shipped default is the E2E's
   * (viewer/residency/motionResidency.spec.ts, which navigates with no
   * `?feature=`).
   *
   * @param {boolean} isOn motion residency on, or off by its kill switch
   * @return {Promise<object>} render result
   */
  async function renderWithViewer(isOn) {
    mockIsFeatureEnabled.mockImplementation((name) => (name === 'disableMotionResidency' ? !isOn : false))
    const viewer = viewerDouble()
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setViewer(viewer)
    })
    const rendered = await renderWithModel(residencyModel())
    return {...rendered, viewer}
  }

  afterEach(async () => {
    mockIsFeatureEnabled.mockReset()
    window.location.hash = ''
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModel(null)
      result.current.setViewer(null)
      result.current.resetDisplayOverrides()
    })
  })

  it('is absent with disableMotionResidency on, and the at-rest section keeps its title', async () => {
    const {getByTestId, queryByTestId, viewer} = await renderWithViewer(false)
    fireEvent.click(getByTestId('control-button-residency'))
    expect(queryByTestId('motion-residency-slider')).toBeNull()
    expect(getByTestId('residency-slider')).toBeTruthy()
    expect(viewer.listeners).toEqual([])
  })

  it('defaults to Auto with the slider disabled, and listens to the camera', async () => {
    const {getByTestId, getByText, viewer} = await renderWithViewer(true)
    fireEvent.click(getByTestId('control-button-residency'))
    expect(getByText('Residency at rest: 100%')).toBeTruthy()
    expect(getByTestId('motion-residency-label').textContent).toBe('While moving: Auto')
    expect(getByTestId('motion-residency-auto').querySelector('input').checked).toBe(true)
    expect(getByTestId('motion-residency-slider').querySelector('input').disabled).toBe(true)
    expect(viewer.listeners.map(([type]) => type)).toContain('update')
    // Untouched, it writes no token.
    expect(window.location.hash).not.toContain('d:')
  })

  it('persists a manual choice and its metric to the store and the #d: token', async () => {
    const {getByTestId} = await renderWithViewer(true)
    fireEvent.click(getByTestId('control-button-residency'))
    fireEvent.click(getByTestId('motion-residency-auto').querySelector('input'))
    fireEvent.click(getByTestId('motion-residency-metric-memory').querySelector('input'))
    await settleLink()
    expect(window.location.hash).toContain('mres=100.memory')
    const {result} = renderHook(() => useStore((state) => state.displayOverrides))
    expect(result.current.model.appearance.motionResidency)
      .toEqual({mode: 'manual', percent: 100, metric: ResidencyMetric.MEMORY})
    expect(getByTestId('motion-residency-slider').querySelector('input').disabled).toBe(false)
  })

  it('re-ranks the motion distance ordering when the selection changes', async () => {
    jest.useFakeTimers()
    try {
      // Three instances 10 apart on X; the double's `getMatrixAt` places them.
      const model = residencyModel()
      model.getMatrixAt = (index, matrix) => matrix.makeTranslation(index * 10, 0, 0)
      const {getByTestId, viewer} = await renderWithViewer(true)
      await act(() => {
        useStore.getState().setModel(model)
      })
      fireEvent.click(getByTestId('control-button-residency'))
      fireEvent.click(getByTestId('motion-residency-auto').querySelector('input'))
      fireEvent.click(getByTestId('motion-residency-metric-distance').querySelector('input'))
      // A manual 34%: one of three instances kept while moving.
      await act(() => {
        useStore.getState().setDisplayOverride({kind: 'model'},
          {motionResidency: {mode: 'manual', percent: 34, metric: ResidencyMetric.DISTANCE}})
      })
      const kept = async (expressID) => {
        await act(() => {
          useStore.getState().setSelectedElement({expressID})
        })
        // The prepared ordering is rebuilt in idle time.
        await act(() => {
          jest.advanceTimersByTime(1000)
        })
        model.setVisibleAt.mockClear()
        const update = viewer.listeners.filter(([type]) => type === 'update').at(-1)[1]
        update()
        const shown = new Set([0, 1, 2])
        for (const [index, visible] of model.setVisibleAt.mock.calls) {
          if (!visible) {
            shown.delete(index)
          }
        }
        return [...shown]
      }
      // Instance i has parent instanceParents[i] = [11, 12, 20][i].
      expect(await kept(11)).toEqual([0])
      // Let the gesture rest: no frames run in this double, so end it by
      // turning the setting over (a change mid-gesture restores).
      await act(() => {
        useStore.getState().setDisplayOverride({kind: 'model'},
          {motionResidency: {mode: 'manual', percent: 33, metric: ResidencyMetric.DISTANCE}})
      })
      expect(await kept(20)).toEqual([2])
    } finally {
      jest.useRealTimers()
    }
  })

  it('re-ranks the at-rest distance ordering on a deselect too (B2 gap)', async () => {
    // Before #2130 a deselect left the at-rest set ranked by the old
    // selection; with no selection DISTANCE falls back to occupancy (the
    // biggest part, instance 2).
    window.location.hash = '#d:res=34.distance'
    const model = residencyModel()
    model.getMatrixAt = (index, matrix) => matrix.makeTranslation(index * 10, 0, 0)
    await renderWithViewer(false)
    await act(() => {
      useStore.getState().setModel(model)
    })
    const shownAfter = async (selected) => {
      model.setVisibleAt.mockClear()
      await act(() => {
        useStore.getState().setSelectedElement(selected)
      })
      return model.setVisibleAt.mock.calls.filter(([, visible]) => visible).map(([index]) => index)
    }
    expect(await shownAfter({expressID: 11})).toEqual([0])
    expect(await shownAfter(null)).toEqual([2])
  })

  it('restores a manual percent from a #d: permalink on cold load', async () => {
    window.location.hash = '#d:mres=30.distance'
    const {getByTestId} = await renderWithViewer(true)
    fireEvent.click(getByTestId('control-button-residency'))
    expect(getByTestId('motion-residency-label').textContent).toBe('While moving: 30%')
    expect(getByTestId('motion-residency-slider').querySelector('input').value).toBe('30')
    expect(getByTestId('motion-residency-metric-distance').querySelector('input').checked).toBe(true)
  })
})


describe('ResidencyControl volume section', () => {
  /**
   * A small CT volume, as nrrd.js builds one from NRRDLoader's Volume: packed
   * over [-1024, 3071] HU, opening at 150–900 HU.
   *
   * @return {object} the model root
   */
  function ctVolumeModel() {
    return nrrdToThree({
      data: new Int16Array(8),
      dimensions: [2, 2, 2],
      windowLow: -1000,
      windowHigh: 1000,
      header: {vectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], space_origin: ['0', '0', '0'], modality: '=CT'},
    })
  }

  afterEach(async () => {
    await act(() => {
      useStore.getState().setModel(null)
      useStore.getState().resetDisplayOverrides()
    })
  })

  it('offers the window and opacity, in HU, and none of the other sections', async () => {
    const {getByTestId, queryByTestId} = await renderWithModel(ctVolumeModel())
    fireEvent.click(getByTestId('control-button-residency'))
    expect(getByTestId('volume-window-label').textContent).toBe('Window: 150 – 900 HU')
    expect(getByTestId('volume-opacity-label').textContent).toBe('Opacity: 100%')
    expect(queryByTestId('color-mode-group')).toBeNull()
    expect(queryByTestId('shading-mode-group')).toBeNull()
    expect(queryByTestId('residency-slider')).toBeNull()
  })

  it('moves the shader, the store and the #d: token with the sliders', async () => {
    const model = ctVolumeModel()
    const {getByTestId} = await renderWithModel(model)
    const {uniforms} = model.children[0].material
    fireEvent.click(getByTestId('control-button-residency'))
    // A keyboard step commits, as a mouse release does.
    const opacity = getByTestId('volume-opacity-slider').querySelector('input')
    fireEvent.keyDown(opacity, {key: 'PageDown'})
    const shown = Number(/Opacity: (\d+)%/.exec(getByTestId('volume-opacity-label').textContent)[1])
    expect(shown).toBeLessThan(100)
    expect(uniforms.opacity.value).toBeCloseTo(shown / 100)
    const [, high] = getByTestId('volume-window-slider').querySelectorAll('input')
    fireEvent.keyDown(high, {key: 'PageUp'})
    const rampBefore = (900 + 1024) / 4095
    expect(uniforms.ramp.value[1]).toBeGreaterThan(rampBefore)
    await settleLink()
    expect(window.location.hash).toMatch(new RegExp(`d:vw=150_\\d+,vo=${shown}`))

    // Reset: back to the volume as it loaded, and out of the link.
    fireEvent.click(getByTestId('volume-reset'))
    await settleLink()
    expect(uniforms.opacity.value).toBe(1)
    expect(uniforms.ramp.value[1]).toBeCloseTo(rampBefore)
    expect(window.location.hash).not.toContain('d:')
  })

  it('keeps the window\'s thumbs a step apart, rather than jump back to the default when they meet', async () => {
    // Found by the E2E: the low thumb run up to the high one made equal ends,
    // which aren't a window, and the menu snapped back to 150–900.
    const {getByTestId} = await renderWithModel(ctVolumeModel())
    fireEvent.click(getByTestId('control-button-residency'))
    const [low, high] = getByTestId('volume-window-slider').querySelectorAll('input')
    // PageUp, not End: End is the browser's own range-input key, which jsdom
    // doesn't implement; MUI handles PageUp itself, 10 units a press. Enough
    // presses to run the low thumb from 150 into the high one at 900.
    expect(high).toBeTruthy()
    for (let i = 0; i < 100; i++) {
      fireEvent.keyDown(low, {key: 'PageUp'})
    }
    const [, lowShown, highShown] = /Window: (-?\d+) – (-?\d+) HU/.exec(getByTestId('volume-window-label').textContent)
    expect(Number(highShown)).toBe(900)
    // One slider step (20 HU over this 4095 HU range) below it.
    expect(Number(highShown) - Number(lowShown)).toBe(20)
  })

  it('opens a link\'s window and opacity', async () => {
    window.location.hash = '#d:vw=0_400,vo=50'
    const model = ctVolumeModel()
    const {getByTestId} = await renderWithModel(model)
    fireEvent.click(getByTestId('control-button-residency'))
    expect(getByTestId('volume-window-label').textContent).toBe('Window: 0 – 400 HU')
    const {uniforms} = model.children[0].material
    expect(uniforms.opacity.value).toBe(0.5)
    expect(uniforms.ramp.value[0]).toBeCloseTo(1024 / 4095)
    expect(uniforms.ramp.value[1]).toBeCloseTo(1424 / 4095)
  })
})
