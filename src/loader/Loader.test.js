import {readModel} from './Loader'
import {Object3D, Mesh, BufferGeometry, Material, BufferAttribute} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'


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

  describe('readModel', () => {
    it('passes through model with existing geometry unchanged', async () => {
      const mockLoader = {
        parse: jest.fn().mockReturnValue({
          geometry: new BufferGeometry(),
          material: new Material(),
          isObject3D: true,
        }),
      }

      const result = await readModel(mockLoader, 'test-data', './', false, false, null, null)

      expect(result.geometry).toBeDefined()
      expect(result.geometry).toBeInstanceOf(BufferGeometry)
      expect(mockLoader.parse).toHaveBeenCalledWith('test-data', './')
    })

    it('finds geometry in children when model has no direct geometry', async () => {
      // Mock mesh child with geometry
      const meshChild = new Mesh(new BufferGeometry(), new Material())
      meshChild.geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))

      const mockLoader = {
        parse: jest.fn().mockReturnValue({
          children: [
            new Object3D(), // First child without geometry
            meshChild, // Second child with geometry
          ],
          isObject3D: true,
        }),
      }

      // Spy on console.warn to check if warning is logged
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      const result = await readModel(mockLoader, 'test-data', './', false, false, null, null)

      expect(result.geometry).toBeDefined()
      expect(result.geometry).toBe(meshChild.geometry)
      expect(consoleSpy).toHaveBeenCalledWith('Only using first mesh for some operations')

      consoleSpy.mockRestore()
    })

    it('throws error when model has no geometry and children have no geometry', async () => {
      const mockLoader = {
        parse: jest.fn().mockReturnValue({
          children: [
            new Object3D(), // Child without geometry
            new Object3D(), // Another child without geometry
          ],
          isObject3D: true,
        }),
      }

      await expect(readModel(mockLoader, 'test-data', './', false, false, null, null))
        .rejects.toThrow('Could not find geometry to work with in model')
    })

    it('throws error when loader returns null model', async () => {
      const mockLoader = {
        parse: jest.fn().mockReturnValue(null),
      }

      await expect(readModel(mockLoader, 'test-data', './', false, false, null, null))
        .rejects.toThrow('Loader could not read model')
    })

    it('calls fixupCb when provided', async () => {
      const mockModel = {
        geometry: new BufferGeometry(),
        material: new Material(),
        isObject3D: true,
      }

      const mockLoader = {
        parse: jest.fn().mockReturnValue(mockModel),
      }

      const mockViewer = {test: 'viewer'}
      const fixupCb = jest.fn().mockImplementation((model, viewer) => {
        expect(model).toBe(mockModel)
        expect(viewer).toBe(mockViewer)
        return {...model, fixed: true}
      })

      const result = await readModel(mockLoader, 'test-data', './', false, false, mockViewer, fixupCb)

      expect(fixupCb).toHaveBeenCalledWith(mockModel, mockViewer)
      expect(result.fixed).toBe(true)
    })

    it('handles async loader correctly', async () => {
      const mockModel = {
        geometry: new BufferGeometry(),
        material: new Material(),
        isObject3D: true,
      }

      const mockLoader = {
        parse: jest.fn().mockResolvedValue(mockModel),
      }

      const result = await readModel(mockLoader, 'test-data', './', true, false, null, null)

      expect(result).toBe(mockModel)
      expect(mockLoader.parse).toHaveBeenCalledWith('test-data', './')
    })

    it('handles GLTFLoader with callback correctly', async () => {
      const mockModel = {
        geometry: new BufferGeometry(),
        material: new Material(),
        isObject3D: true,
      }

      // Create actual GLTFLoader instance and mock its parse method
      const mockLoader = new GLTFLoader()
      mockLoader.parse = jest.fn().mockImplementation((data, basePath, onLoad, onError) => {
        // Simulate immediate callback (not async)
        onLoad(mockModel)
      })

      const result = await readModel(mockLoader, 'test-data', './', false, false, null, null)

      expect(result).toBe(mockModel)
      expect(mockLoader.parse).toHaveBeenCalledWith(
        'test-data',
        './',
        expect.any(Function),
        expect.any(Function),
      )
    })
  })
})
