import {BatchedMesh, Group, Scene} from 'three'
import {STREAMING_BATCHES_KEY, paintStreamingSelection, streamingBatchRoots, streamingPickOf}
  from './streamingBatchPick'


describe('streamingBatchPick', () => {
  /** @return {object} a scene holding a streaming root with one batch under a group */
  function streamingScene() {
    const scene = new Scene()
    const root = new Group()
    const inner = new Group()
    const mesh = new BatchedMesh(1, 3, 3)
    const builder = {
      pickRow: jest.fn((hitMesh, batchId) => (hitMesh === mesh ? {parentExpressId: 4, batchId} : null)),
      paintSelection: jest.fn(() => 3),
    }
    root.userData[STREAMING_BATCHES_KEY] = builder
    inner.add(mesh)
    root.add(inner)
    scene.add(root)
    scene.add(new Group())
    return {scene, root, mesh, builder}
  }

  it('finds only the roots that offer streaming batches', () => {
    const {scene, root} = streamingScene()
    expect(streamingBatchRoots(scene)).toEqual([root])
    expect(streamingBatchRoots(null)).toEqual([])
  })

  it('reads a hit on a streaming batch through its root, and nothing else', () => {
    const {mesh, builder} = streamingScene()
    expect(streamingPickOf({object: mesh, batchId: 2})).toEqual({parentExpressId: 4, batchId: 2})
    expect(builder.pickRow).toHaveBeenCalledWith(mesh, 2)
    // A batch with no streaming ancestor (a finished model), or no batch.
    expect(streamingPickOf({object: new BatchedMesh(1, 3, 3), batchId: 0})).toBeNull()
    expect(streamingPickOf({object: new Group()})).toBeNull()
  })

  it('hands the selection to every streaming builder', () => {
    const {scene, builder} = streamingScene()
    const selection = {parents: [1], instances: [], occurrencePath: null}
    expect(paintStreamingSelection(scene, selection, {r: 1, g: 0, b: 0})).toBe(3)
    expect(builder.paintSelection).toHaveBeenCalledWith(selection, {r: 1, g: 0, b: 0})
  })
})
