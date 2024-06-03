// import {load} from './Loader'


// TODO(pablo): export and reuse when bun bug is fixed
// https://github.com/oven-sh/bun/issues/6335
// import {MSW_TEST_PORT} from './setupTests'
// const MSW_TEST_PORT = 3000


let mathRandomSpy
describe('Loader', () => {
  // three.js generates random UUIDs for loaded geometry and material
  // and also references them later, so it's not trivial to freeze or
  // delete them.  So, intercept its call to Math.random instead.
  // TODO(pablo): this should probably increment the value or smth to
  // make each UUID unique.
  beforeEach(() => {
    const rand = 0.5
    mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(rand)
  })
  afterEach(() => {
    mathRandomSpy.mockRestore()
  })

  it('loads an OBJ model', async () => {
/* HACK DO NOT SUBMIT
    const onProgress = jest.fn()
    const onUnknownType = jest.fn()
    const onError = jest.fn()
    const model = await load(
      new URL(`http://localhost:${MSW_TEST_PORT}/models/obj/Bunny.obj`),
      onProgress,
      onUnknownType,
      onError,
    )
    expect(onUnknownType).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    // TODO(pablo): not called
    // expect(onProgress).toHaveBeenCalled()
    expect(model).toBeDefined()
    expect(model.children[0].isObject3D).toBe(true)
    expect(model).toMatchSnapshot()
*/
  })

  // TODO(pablo): Dies with 'Trace: Loader error during parse:
  // RangeError: Offset is outside the bounds of the DataView'
  // But no stack trace.
  // However, Duck.glb does load for live server.
/*
  it('loads an GLB model', async () => {
    const onProgress = jest.fn()
    const onUnknownType =  jest.fn()
    const onError =  jest.fn()
    const model = await load(
      `http://localhost:${MSW_TEST_PORT}/models/gltf/Duck.glb`,
      onProgress,
      onUnknownType,
      onError
    )
    expect(onUnknownType).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    // TODO(pablo): not called
    // expect(onProgress).toHaveBeenCalled()
    expect(model).toBeDefined()
    //expect(model.children[0].isObject3D).toBe(true)
    expect(model).toMatchSnapshot()
  })
*/
})
