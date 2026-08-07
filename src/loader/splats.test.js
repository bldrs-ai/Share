import {Box3, Group, Scene, Vector3} from 'three'
import splatsToThree, {newSplatLoader, splatTypes} from './splats'


// Spark is mocked: its real module boots a wasm sorter + workers that
// don't exist in jsdom, and these tests exercise the shim's contract
// (byte/fileType plumbing, Group wrapping, bounds proxy, SparkRenderer
// lifecycle), not spark's decoder.
jest.mock('@sparkjsdev/spark', () => {
  const three = require('three')
  /** Stand-in for spark's SplatMesh: records options, resolves init. */
  class SplatMesh extends three.Object3D {
    /** @param {object} options */
    constructor(options) {
      super()
      this.options = options
      this.initialized = Promise.resolve(this)
    }

    /** @return {Box3} fixed local-space splat-centers box */
    getBoundingBox() {
      return new three.Box3(
        new three.Vector3(-1, 0, -2),
        new three.Vector3(1, 4, 2),
      )
    }
  }
  /** Stand-in for spark's SparkRenderer scene object. */
  class SparkRenderer extends three.Object3D {
    /** @param {object} options */
    constructor(options) {
      super()
      this.options = options
    }
  }
  return {SplatMesh, SparkRenderer}
})


describe('splats', () => {
  /** @return {object} minimal viewer with a renderer-backed scene */
  function newMockViewer() {
    const scene = new Scene()
    return {
      scene,
      context: {
        getRenderer: () => ({isWebGLRenderer: true}),
        getScene: () => scene,
      },
    }
  }

  it('exposes the splat extensions Loader wires up', () => {
    expect(splatTypes).toStrictEqual(['ksplat', 'ply', 'sog', 'splat', 'spz'])
  })

  it('parse feeds bytes + mapped fileType to SplatMesh and awaits init', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    const mesh = await newSplatLoader('spz').parse(bytes)
    expect(mesh.options.fileBytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(mesh.options.fileBytes)).toStrictEqual([1, 2, 3])
    expect(mesh.options.fileType).toBe('spz')
  })

  it('maps .sog to spark\'s pcsogszip type', async () => {
    const mesh = await newSplatLoader('sog').parse(new ArrayBuffer(1))
    expect(mesh.options.fileType).toBe('pcsogszip')
  })

  it('wraps the mesh in a Group with y-up orientation and a bounds proxy', async () => {
    const viewer = newMockViewer()
    const mesh = await newSplatLoader('splat').parse(new ArrayBuffer(1))
    const root = splatsToThree(mesh, viewer)
    expect(root).toBeInstanceOf(Group)
    expect(root.children).toContain(mesh)
    expect(mesh.rotation.x).toBe(Math.PI)
    // Local splat box (-1,0,-2)..(1,4,2) rotated π about X lands at
    // y ∈ [-4, 0], z ∈ [-2, 2]. The proxy geometry must carry the
    // rotated box so Box3.setFromObject-based framing sees it.
    const EPSILON = 1e-6
    const bounds = new Box3().setFromObject(root)
    expect(bounds.min.distanceTo(new Vector3(-1, -4, -2))).toBeLessThan(EPSILON)
    expect(bounds.max.distanceTo(new Vector3(1, 0, 2))).toBeLessThan(EPSILON)
    expect(root.geometry).toBeDefined()
  })

  it('adds exactly one SparkRenderer per scene across loads', async () => {
    const viewer = newMockViewer()
    const spark = require('@sparkjsdev/spark')
    const isSparkRenderer = (obj) => obj instanceof spark.SparkRenderer
    const meshA = await newSplatLoader('ply').parse(new ArrayBuffer(1))
    splatsToThree(meshA, viewer)
    expect(viewer.scene.children.filter(isSparkRenderer)).toHaveLength(1)
    const meshB = await newSplatLoader('ply').parse(new ArrayBuffer(1))
    splatsToThree(meshB, viewer)
    expect(viewer.scene.children.filter(isSparkRenderer)).toHaveLength(1)
  })

  it('skips SparkRenderer setup in renderer-less contexts', async () => {
    const scene = new Scene()
    const viewer = {context: {getRenderer: () => undefined, getScene: () => scene}}
    const mesh = await newSplatLoader('ply').parse(new ArrayBuffer(1))
    expect(() => splatsToThree(mesh, viewer)).not.toThrow()
    expect(scene.children).toHaveLength(0)
  })
})
