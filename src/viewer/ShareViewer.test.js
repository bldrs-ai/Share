// Phase-2 left a hidden bug: ShareViewer.castRayToIfcScene /
// .highlightIfcItem call `this.context.castRayIfc()`, which existed on the
// fork's IfcContext but not on the ThreeContext wrapper. Tests didn't
// catch it because the impl-level mock stubs setSelection / highlightIfcItem
// as own-property jest.fn()s that shadow the real prototype methods.
//
// These tests reach past the impl mock by calling
// `ShareViewer.prototype.castRayToIfcScene.call(viewer)`, exercising the
// real code path. They lock in the contract that the ShareViewer ↔
// ThreeContext seam routes raycasting correctly.

import {ShareViewer} from './ShareViewer'
import ThreeContext from './three/ThreeContext'


const TEST_MODEL_ID = 7
const TEST_EXPRESS_ID = 42


describe('viewer/ShareViewer raycast routing', () => {
  it('castRayToIfcScene routes through ThreeContext.castRayIfc to the legacy raycaster', () => {
    const viewer = new ShareViewer()
    // Sanity: the constructor should have wrapped this.context.
    expect(viewer.context).toBeInstanceOf(ThreeContext)

    // Inject a legacy castRayIfc that returns a known hit.
    const fakeMesh = {
      modelID: TEST_MODEL_ID,
      geometry: {attributes: {expressID: {array: new Int8Array([TEST_EXPRESS_ID])}}},
    }
    const fakeHit = {object: fakeMesh, faceIndex: 0}
    viewer.context._legacy.castRayIfc = jest.fn(() => fakeHit)

    // Real getPickedItemId would call IFC.loader.ifcManager.getExpressId;
    // stub it deterministically for this test.
    viewer.getPickedItemId = jest.fn(() => TEST_EXPRESS_ID)

    const result = ShareViewer.prototype.castRayToIfcScene.call(viewer)
    expect(viewer.context._legacy.castRayIfc).toHaveBeenCalled()
    expect(result).toEqual({modelID: TEST_MODEL_ID, id: TEST_EXPRESS_ID})
  })

  it('castRayToIfcScene returns null when the raycast misses', () => {
    const viewer = new ShareViewer()
    viewer.context._legacy.castRayIfc = jest.fn(() => null)

    const result = ShareViewer.prototype.castRayToIfcScene.call(viewer)
    expect(result).toBeNull()
  })
})
