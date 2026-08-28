/* eslint-disable no-magic-numbers */
import {
  applyDisplayOverrides,
  applyResidencyOverrides,
  modelHasColorChoice,
  modelHasShadingChoice,
  resolvedAppearance,
  resolvedColorMode,
  resolvedResidency,
  resolvedShadingMode,
} from './DisplayController'
import {ColorMode} from './colorMode'
import {RESIDENCY_DEFAULT} from './residencyMode'
import {ShadingMode} from './shadingMode'
import {DEFAULT_COLOR} from '../ifc/flatMeshToBatchedModel'
import {ResidencyMetric} from '../residency/ResidencyController'


const grey = () => ({x: DEFAULT_COLOR.x, y: DEFAULT_COLOR.y, z: DEFAULT_COLOR.z, w: 1})


/**
 * Colorless two-part batched-model double (the palette-eligible case), in the
 * shape assembleBatchedModel stamps.
 *
 * @return {object} model double
 */
function colorlessModel() {
  const source = [grey(), grey(), grey()]
  return {
    isBatchedMesh: true,
    instanceSourceColors: source.map((c) => ({...c})),
    instanceColors: source.map((c) => ({...c})),
    instanceParents: [11, 12, 20],
    instanceGeometryIds: [500, 500, 600],
    material: {wireframe: false},
    userData: {},
    setColorAt: jest.fn(),
  }
}


const modelColor = (mode) => [{scope: {kind: 'model'}, appearance: {color: mode}}]


describe('resolvedColorMode', () => {
  it('reads the model-scope override when set', () => {
    const model = colorlessModel()
    expect(resolvedColorMode(model, modelColor(ColorMode.SOURCE))).toBe(ColorMode.SOURCE)
  })

  it('falls back to the model\'s live mode when no override is set', () => {
    const model = colorlessModel() // loaded state: never palette-painted -> source
    expect(resolvedColorMode(model, [])).toBe(ColorMode.SOURCE)
  })

  it('is AUTO with no model and no override', () => {
    expect(resolvedColorMode(null, [])).toBe(ColorMode.AUTO)
  })
})


describe('applyDisplayOverrides', () => {
  it('applies a model-scope color override to the scene', () => {
    const model = colorlessModel()
    applyDisplayOverrides(model, modelColor(ColorMode.AUTO))
    expect(model.setColorAt).toHaveBeenCalled()
    // Auto repainted the grey away.
    expect(model.instanceColors[0]).not.toEqual(grey())
  })

  it('is a no-op with no color axis resolved', () => {
    const model = colorlessModel()
    applyDisplayOverrides(model, []) // empty stack -> no color axis
    expect(model.setColorAt).not.toHaveBeenCalled()
  })

  it('applies a shading override independently of color', () => {
    const model = colorlessModel()
    applyDisplayOverrides(model, [{scope: {kind: 'model'}, appearance: {shading: ShadingMode.WIREFRAME}}])
    expect(model.material.wireframe).toBe(true)
    // No color axis in the override -> color untouched.
    expect(model.setColorAt).not.toHaveBeenCalled()
  })

  it('applies color and shading together from one resolved appearance', () => {
    const model = colorlessModel()
    applyDisplayOverrides(model, [{
      scope: {kind: 'model'},
      appearance: {color: ColorMode.AUTO, shading: ShadingMode.WIREFRAME},
    }])
    expect(model.setColorAt).toHaveBeenCalled()
    expect(model.material.wireframe).toBe(true)
  })

  it('tolerates a null model', () => {
    expect(() => applyDisplayOverrides(null, modelColor(ColorMode.AUTO))).not.toThrow()
  })
})


describe('resolvedShadingMode / modelHasShadingChoice', () => {
  it('reads the override, else the live mode, else shaded', () => {
    const model = colorlessModel()
    expect(resolvedShadingMode(model,
      [{scope: {kind: 'model'}, appearance: {shading: ShadingMode.WIREFRAME}}]))
      .toBe(ShadingMode.WIREFRAME)
    expect(resolvedShadingMode(model, [])).toBe(ShadingMode.SHADED)
    expect(resolvedShadingMode(null, [])).toBe(ShadingMode.SHADED)
  })

  it('offers shading whenever the model has a material', () => {
    expect(modelHasShadingChoice(colorlessModel())).toBe(true)
    expect(modelHasShadingChoice(null)).toBe(false)
  })
})


describe('modelHasColorChoice', () => {
  it('is true for a colorless multi-part model, false for none', () => {
    expect(modelHasColorChoice(colorlessModel())).toBe(true)
    expect(modelHasColorChoice(null)).toBe(false)
  })
})


const modelResidency = (residency) => [{scope: {kind: 'model'}, appearance: {residency}}]


describe('resolvedResidency', () => {
  it('is the default with an empty stack', () => {
    expect(resolvedResidency([])).toEqual({...RESIDENCY_DEFAULT})
  })

  it('reads the model-scope override', () => {
    expect(resolvedResidency(modelResidency({percent: 40, metric: ResidencyMetric.MEMORY})))
      .toEqual({percent: 40, metric: ResidencyMetric.MEMORY})
  })

  it('fills the defaults around a partial override', () => {
    // The `#d:` reader emits partials when it understands only half of a
    // `res=` term; the axis must still resolve to something applicable.
    expect(resolvedResidency(modelResidency({percent: 40})))
      .toEqual({percent: 40, metric: RESIDENCY_DEFAULT.metric})
    expect(resolvedResidency(modelResidency({metric: ResidencyMetric.DISTANCE})))
      .toEqual({percent: RESIDENCY_DEFAULT.percent, metric: ResidencyMetric.DISTANCE})
  })
})


describe('applyResidencyOverrides', () => {
  /**
   * ResidencyController stand-in: the two setters this module calls, plus the
   * `target` / `metric` fields it reads to decide whether calling them is
   * worth the instance-table re-sort.
   *
   * @return {object} controller double
   */
  function controllerDouble() {
    const controller = {target: 1, metric: RESIDENCY_DEFAULT.metric}
    controller.setTarget = jest.fn((fraction) => {
      controller.target = fraction
    })
    controller.setMetric = jest.fn((metric) => {
      controller.metric = metric
    })
    return controller
  }

  it('pushes percent and metric at the controller', () => {
    const controller = controllerDouble()
    applyResidencyOverrides(controller, modelResidency({percent: 40, metric: ResidencyMetric.MEMORY}))
    expect(controller.setTarget).toHaveBeenCalledWith(0.4)
    expect(controller.setMetric).toHaveBeenCalledWith(ResidencyMetric.MEMORY)
  })

  it('no-ops when nothing moved', () => {
    // The effect that calls this is keyed on the whole override map, so it
    // re-runs on unrelated axes; each setter re-sorts the instance table.
    const controller = controllerDouble()
    applyResidencyOverrides(controller, [])
    expect(controller.setTarget).not.toHaveBeenCalled()
    expect(controller.setMetric).not.toHaveBeenCalled()
  })

  it('tolerates no controller', () => {
    expect(() => applyResidencyOverrides(null, modelResidency({percent: 40}))).not.toThrow()
  })
})


describe('resolvedAppearance', () => {
  it('carries every axis at once', () => {
    const model = colorlessModel()
    expect(resolvedAppearance(model, [{
      scope: {kind: 'model'},
      appearance: {
        color: ColorMode.SOURCE,
        shading: ShadingMode.WIREFRAME,
        residency: {percent: 40, metric: ResidencyMetric.MEMORY},
      },
    }])).toEqual({
      color: ColorMode.SOURCE,
      shading: ShadingMode.WIREFRAME,
      residency: {percent: 40, metric: ResidencyMetric.MEMORY},
    })
  })

  it('reports the default for an axis the model offers no choice on', () => {
    // The point of the gate: `activeColorMode` says SOURCE for any model that
    // shipped its own colors (live === source there), and serializing that
    // would stamp `color=src` onto every colored IFC's share link.
    const authored = colorlessModel()
    authored.instanceColors[0] = {x: 0.6, y: 0.576, z: 0.749, w: 1}
    authored.instanceSourceColors[0] = {x: 0.6, y: 0.576, z: 0.749, w: 1}
    expect(modelHasColorChoice(authored)).toBe(false)
    expect(resolvedAppearance(authored, []).color).toBe(ColorMode.AUTO)
  })

  it('trusts the stack alone when no model is loaded', () => {
    expect(resolvedAppearance(null, modelColor(ColorMode.SOURCE)).color).toBe(ColorMode.SOURCE)
  })
})
