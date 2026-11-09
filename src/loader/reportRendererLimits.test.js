import {BatchedMesh, Group, Mesh, MeshBasicMaterial} from 'three'
import {gtagEvent} from '../privacy/analytics'
import {reportRendererInfo} from './loadProgress'
import {NO_MULTI_DRAW_LINE, reportRendererLimits} from './reportRendererLimits'


jest.mock('../privacy/analytics', () => ({gtagEvent: jest.fn()}))
jest.mock('./loadProgress', () => ({reportRendererInfo: jest.fn()}))


/**
 * @param {boolean} multiDraw whether the context offers WEBGL_multi_draw
 * @return {Function} a getter for a renderer stand-in with three's `extensions.has`
 */
function rendererWith(multiDraw) {
  return () => ({extensions: {has: (name) => name === 'WEBGL_multi_draw' && multiDraw}})
}


/** @return {object} a Group holding one BatchedMesh, as a hydrated or Conway-direct model */
function batchedModel() {
  const model = new Group()
  model.add(new BatchedMesh(1, 3, 3, new MeshBasicMaterial()))
  return model
}


describe('loader/reportRendererLimits', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports a batched model drawing without WEBGL_multi_draw, to the report and to GA', () => {
    reportRendererLimits(batchedModel(), rendererWith(false), 'glb')
    expect(reportRendererInfo).toHaveBeenCalledWith(NO_MULTI_DRAW_LINE)
    expect(gtagEvent).toHaveBeenCalledWith('renderer_fallback', {condition: 'no_multi_draw', format: 'glb'})
  })

  it('says nothing when the renderer has WEBGL_multi_draw', () => {
    reportRendererLimits(batchedModel(), rendererWith(true), 'glb')
    expect(reportRendererInfo).not.toHaveBeenCalled()
    expect(gtagEvent).not.toHaveBeenCalled()
  })

  it('says nothing for a model with no BatchedMesh, which draws the same either way', () => {
    const model = new Group()
    model.add(new Mesh())
    reportRendererLimits(model, rendererWith(false), 'obj')
    expect(reportRendererInfo).not.toHaveBeenCalled()
    // A bare BatchedMesh model (no Group) is still one.
    reportRendererLimits(new BatchedMesh(1, 3, 3, new MeshBasicMaterial()), rendererWith(false), 'ifc')
    expect(reportRendererInfo).toHaveBeenCalledTimes(1)
  })

  it('never throws into the load', () => {
    expect(() => reportRendererLimits(batchedModel(), undefined)).not.toThrow()
    expect(() => reportRendererLimits(batchedModel(), () => {
      throw new Error('viewer not set up')
    })).not.toThrow()
    expect(() => reportRendererLimits(batchedModel(), () => ({extensions: {has: () => {
      throw new Error('context lost')
    }}}))).not.toThrow()
    expect(reportRendererInfo).not.toHaveBeenCalled()
  })
})
