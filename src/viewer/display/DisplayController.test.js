/* eslint-disable no-magic-numbers */
import {
  applyDisplayOverrides,
  modelHasColorChoice,
  resolvedColorMode,
} from './DisplayController'
import {ColorMode} from './colorMode'
import {DEFAULT_COLOR} from '../ifc/flatMeshToBatchedModel'


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

  it('tolerates a null model', () => {
    expect(() => applyDisplayOverrides(null, modelColor(ColorMode.AUTO))).not.toThrow()
  })
})


describe('modelHasColorChoice', () => {
  it('is true for a colorless multi-part model, false for none', () => {
    expect(modelHasColorChoice(colorlessModel())).toBe(true)
    expect(modelHasColorChoice(null)).toBe(false)
  })
})
