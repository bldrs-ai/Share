// ShareIfc#dispose, the engine's close path (open-205 #2011 step A, #2031):
// a registered model's engine is closed, the viewer's own ConwayEngine with
// it, and under the in-app switch
// (on by default since step F, utils/spaModelNavMode.js) so is the engine of a
// load still parsing into the viewer, which has no model registered yet. With
// the kill switch or the rollback on, that load is left running, as before.
import ShareIfc from './ShareIfc'
import {isSpaModelNavOn} from '../../utils/spaModelNavMode'


jest.mock('@bldrs-ai/conway/web-ifc', () => ({
  IfcAPI: jest.fn().mockImplementation(() => ({CloseModel: jest.fn()})),
}))
jest.mock('../../utils/spaModelNavMode', () => ({isSpaModelNavOn: jest.fn()}))


/** @return {object} the context surface ShareIfc reads */
function makeContext() {
  return {items: {ifcModels: [], pickableIfcModels: []}, getScene: () => ({add: jest.fn()})}
}


describe('viewer/ifc/ShareIfc#dispose', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('closes the engine of every registered model', () => {
    isSpaModelNavOn.mockReturnValue(false)
    const ifc = new ShareIfc(makeContext())
    const close = jest.fn()
    ifc.addIfcModel({engine: {close}})
    ifc.dispose()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes its own engine, which holds the main-thread route\'s model, and drops it', async () => {
    isSpaModelNavOn.mockReturnValue(false)
    const ifc = new ShareIfc(makeContext())
    const engine = ifc.engine
    const conway = engine.ifcAPI
    // As a kill-switch load leaves it: the model registered, on this engine.
    engine.modelID = 0
    ifc.addIfcModel({engine})
    ifc.dispose()
    await engine.closing
    expect(conway.CloseModel).toHaveBeenCalledTimes(1)
    expect(engine.ifcAPI).toBeNull()
    expect(ifc.engine).toBeNull()
  })

  it('under the in-app switch, also gives up an engine still parsing, which has no model yet', () => {
    isSpaModelNavOn.mockReturnValue(true)
    const ifc = new ShareIfc(makeContext())
    const parsing = {abort: jest.fn()}
    const finished = {abort: jest.fn()}
    ifc.trackEngineLoad(parsing)
    const untrack = ifc.trackEngineLoad(finished)
    // A parse that settled has untracked itself.
    untrack()

    ifc.dispose()

    expect(parsing.abort).toHaveBeenCalledTimes(1)
    expect(finished.abort).not.toHaveBeenCalled()
    expect(ifc.engineLoads.size).toBe(0)
  })

  it('with the kill switch on, leaves an engine still parsing alone, as before', () => {
    isSpaModelNavOn.mockReturnValue(false)
    const ifc = new ShareIfc(makeContext())
    const parsing = {abort: jest.fn()}
    ifc.trackEngineLoad(parsing)
    ifc.dispose()
    expect(parsing.abort).not.toHaveBeenCalled()
  })

  it('one load whose abort throws does not stop the others', () => {
    isSpaModelNavOn.mockReturnValue(true)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const ifc = new ShareIfc(makeContext())
      const broken = {abort: jest.fn(() => {
        throw new Error('boom')
      })}
      const other = {abort: jest.fn()}
      ifc.trackEngineLoad(broken)
      ifc.trackEngineLoad(other)
      ifc.dispose()
      expect(other.abort).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith('ShareIfc.dispose: engine load abort failed:', expect.any(Error))
    } finally {
      warn.mockRestore()
    }
  })
})
