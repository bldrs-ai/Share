import {IfcContext} from './context'


/**
 * `updateAllComponents` against a stand-in `this`: the frame's order is all
 * that is under test.
 *
 * @param {boolean} isSession whether the viewer paints on demand
 * @return {Array<string>} the components, in the order they ran
 */
function runFrame(isSession) {
  const ran = []
  const component = (name) => ({update: () => ran.push(name)})
  const renderer = component('renderer')
  const self = {
    clock: {getDelta: () => 0.016},
    renderDemand: {isSession},
    renderer,
    // Registration order, as IfcContext builds it: the renderer before the
    // camera, and per-frame upkeep (ThreeContext#onFrame) last.
    items: {components: [component('scene'), renderer, component('camera'), component('placemarks')]},
  }
  IfcContext.prototype.updateAllComponents.call(self)
  return ran
}


describe('viewer/three/context/IfcContext#updateAllComponents', () => {
  it('keeps the vendored registration order when every frame paints', () => {
    expect(runFrame(false)).toEqual(['scene', 'renderer', 'camera', 'placemarks'])
  })

  // `?feature=renderOnDemand` (story #2055): a frame paints what this frame's
  // camera and upkeep left, so neither a move nor a marker rescale shows a
  // frame late, and a frame painted on an ask isn't spent on the old state.
  it('paints last when the viewer paints on demand', () => {
    expect(runFrame(true)).toEqual(['scene', 'camera', 'placemarks', 'renderer'])
  })
})
