import {
  BatchedMesh, BoxGeometry, BufferAttribute, Color, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Plane, Scene,
  Texture, Vector3,
} from 'three'
import RenderDemand, {EXPENSIVE_PAINT_MS, SETTLE_MS, runPaint} from './renderDemand'
import {attachSessionNets, createSceneProbe, installSceneHooks} from './renderDemandHooks'


/* eslint-disable no-magic-numbers */


const FRAME_MS = 16


describe('viewer/three/renderDemandHooks', () => {
  let clock
  let demand

  beforeEach(() => {
    clock = 10_000
    demand = new RenderDemand({now: () => clock})
    demand.startSession()
  })

  afterEach(() => {
    demand.dispose()
  })

  /**
   * Run frames until one doesn't paint, so the next frame is a clean read.
   */
  function settle() {
    for (let i = 0; i < 100 && demand.shouldRender(); i++) {
      demand.rendered(1)
      clock += FRAME_MS
    }
  }

  /** @return {boolean} whether the next frame paints */
  function nextFramePaints() {
    clock += FRAME_MS
    return demand.shouldRender()
  }


  describe('installSceneHooks', () => {
    let uninstall

    beforeEach(() => {
      uninstall = installSceneHooks()
    })

    afterEach(() => {
      uninstall()
    })

    it('is idempotent: a second install wraps nothing twice', () => {
      const wrapped = Group.prototype.add
      expect(installSceneHooks()).toBe(uninstall)
      expect(Group.prototype.add).toBe(wrapped)
    })

    it('asks for a paint when the scene graph changes, at any depth', () => {
      const scene = new Scene()
      const model = new Group()
      scene.add(model)
      settle()
      const subset = new Mesh()
      model.add(subset)
      expect(nextFramePaints()).toBe(true)
      settle()
      subset.removeFromParent()
      expect(nextFramePaints()).toBe(true)
      settle()
      model.attach(new Mesh())
      expect(nextFramePaints()).toBe(true)
    })

    it('asks for a paint when a batch is recoloured, hidden or moved', () => {
      const batch = new BatchedMesh(4, 64, 64, new MeshBasicMaterial())
      const geometryId = batch.addGeometry(new BoxGeometry())
      const instanceId = batch.addInstance(geometryId)
      settle()
      batch.setColorAt(instanceId, new Color(1, 0, 0))
      expect(nextFramePaints()).toBe(true)
      settle()
      batch.setVisibleAt(instanceId, false)
      expect(nextFramePaints()).toBe(true)
      settle()
      batch.deleteInstance(instanceId)
      expect(nextFramePaints()).toBe(true)
    })

    it('asks for a paint on needsUpdate of a material, a texture or an attribute', () => {
      const material = new MeshBasicMaterial()
      const texture = new Texture()
      const attribute = new BufferAttribute(new Float32Array(3), 3)
      for (const changed of [material, texture, attribute]) {
        settle()
        changed.needsUpdate = true
        expect(nextFramePaints()).toBe(true)
      }
      // The setter still does three's own work.
      expect(material.version).toBe(1)
      expect(texture.version).toBe(1)
      expect(attribute.version).toBe(1)
    })

    it('does not count what three changes while painting', () => {
      const scene = new Scene()
      settle()
      runPaint(() => {
        scene.add(new Mesh())
        new Texture().needsUpdate = true
      })
      expect(nextFramePaints()).toBe(false)
    })

    it('restores three as it was', () => {
      uninstall()
      const scene = new Scene()
      settle()
      scene.add(new Mesh())
      new MeshBasicMaterial().needsUpdate = true
      expect(nextFramePaints()).toBe(false)
      uninstall = installSceneHooks()
    })
  })


  describe('createSceneProbe', () => {
    /** @return {object} a context with a real camera, scene and a renderer stand-in */
    function makeContext() {
      const canvas = {width: 800, height: 600}
      const renderer = {
        domElement: canvas, getPixelRatio: () => 1, toneMapping: 0, toneMappingExposure: 1,
        outputColorSpace: 'srgb', localClippingEnabled: false, clippingPlanes: [],
      }
      const camera = new PerspectiveCamera()
      const scene = new Scene()
      scene.background = new Color(0.5, 0.5, 0.5)
      return {
        camera, scene, renderer, canvas, clippingPlanes: [],
        getCamera: () => camera, getScene: () => scene, getRenderer: () => renderer,
      }
    }

    // Each case is a change no event announces, made the way the app makes it.
    const changes = {
      'a camera moved without camera-controls': (c) => c.camera.position.set(1, 2, 3),
      'a camera turned': (c) => c.camera.quaternion.set(0, 1, 0, 0),
      'a projection change': (c) => {
        c.camera.fov = 20
        c.camera.updateProjectionMatrix()
      },
      'a canvas resized': (c) => {
        c.canvas.width = 400
      },
      'a cut plane added': (c) => c.renderer.clippingPlanes.push(new Plane(new Vector3(0, 1, 0), 0)),
      'a model added at the root': (c) => c.scene.children.push(new Group()),
      'a background recoloured in place': (c) => c.scene.background.set(0.1, 0.2, 0.3),
      'an environment swapped': (c) => {
        c.scene.environment = new Texture()
      },
      'tone mapping exposure': (c) => {
        c.renderer.toneMappingExposure = 2
      },
    }

    for (const [name, change] of Object.entries(changes)) {
      it(`sees ${name}`, () => {
        const context = makeContext()
        const probe = createSceneProbe(context)
        probe.snapshot()
        expect(probe.changed()).toBe(false)
        change(context)
        expect(probe.changed()).toBe(true)
        probe.snapshot()
        expect(probe.changed()).toBe(false)
      })
    }

    it('sees a cut plane dragged in place (its constant moves, the array does not)', () => {
      const context = makeContext()
      const plane = new Plane(new Vector3(0, 1, 0), 0)
      context.renderer.clippingPlanes.push(plane)
      const probe = createSceneProbe(context)
      probe.snapshot()
      plane.constant = 4
      expect(probe.changed()).toBe(true)
    })

    it('reads a context mid-dispose as unchanged rather than throwing', () => {
      const probe = createSceneProbe({getCamera: () => {
        throw new Error('disposed')
      }})
      probe.snapshot()
      expect(probe.changed()).toBe(false)
    })

    it('drives the session: an idle frame paints only after the probe sees a change', () => {
      demand.dispose()
      const context = makeContext()
      demand = new RenderDemand({now: () => clock})
      demand.startSession({probe: createSceneProbe(context)})
      settle()
      expect(nextFramePaints()).toBe(false)
      context.camera.position.x += 1
      expect(nextFramePaints()).toBe(true)
    })
  })


  describe('attachSessionNets', () => {
    let canvas
    let detach

    beforeEach(() => {
      canvas = document.createElement('canvas')
      document.body.appendChild(canvas)
      detach = attachSessionNets(demand, canvas)
      settle()
    })

    afterEach(() => {
      detach()
      canvas.remove()
    })

    /** @return {number} frames that paint over the next settle window and a bit */
    function paintsOverSettle() {
      let paints = 0
      for (let i = 0; i < Math.ceil(SETTLE_MS / FRAME_MS) + 5; i++) {
        clock += FRAME_MS
        if (demand.shouldRender()) {
          demand.rendered(1)
          paints++
        }
      }
      return paints
    }

    it('opens the settle window on user input anywhere on the page', () => {
      for (const type of ['pointerup', 'keydown', 'wheel', 'dblclick']) {
        document.body.dispatchEvent(new Event(type, {bubbles: true}))
        expect(paintsOverSettle()).toBeGreaterThan(Math.floor(SETTLE_MS / FRAME_MS) - 2)
        expect(paintsOverSettle()).toBe(0)
      }
    })

    it('opens it for a pointer moving over the canvas, not over the panels', () => {
      document.body.dispatchEvent(new Event('pointermove', {bubbles: true}))
      expect(paintsOverSettle()).toBe(0)
      canvas.dispatchEvent(new Event('pointermove', {bubbles: true}))
      expect(paintsOverSettle()).toBeGreaterThan(0)
    })

    it('leaves a canvas pointer move to ask for itself while paints are expensive', () => {
      // A paint that took longer than EXPENSIVE_PAINT_MS to the next frame.
      demand.invalidate()
      expect(demand.shouldRender()).toBe(true)
      demand.rendered(1)
      clock += EXPENSIVE_PAINT_MS + 10
      demand.shouldRender()
      canvas.dispatchEvent(new Event('pointermove', {bubbles: true}))
      expect(paintsOverSettle()).toBe(0)
      // A cheap paint again: the move settles as before.
      demand.invalidate()
      expect(demand.shouldRender()).toBe(true)
      demand.rendered(1)
      clock += FRAME_MS
      demand.shouldRender()
      canvas.dispatchEvent(new Event('pointermove', {bubbles: true}))
      expect(paintsOverSettle()).toBeGreaterThan(0)
    })

    it('paints when the context comes back and when the tab does', () => {
      canvas.dispatchEvent(new Event('webglcontextrestored'))
      expect(nextFramePaints()).toBe(true)
      settle()
      document.dispatchEvent(new Event('visibilitychange'))
      expect(nextFramePaints()).toBe(true)
    })

    it('leaves a press alone: a drag asks once the camera moves', () => {
      document.body.dispatchEvent(new Event('pointerdown', {bubbles: true}))
      expect(paintsOverSettle()).toBe(0)
    })

    it('stops listening once detached', () => {
      detach()
      document.body.dispatchEvent(new Event('pointerup', {bubbles: true}))
      canvas.dispatchEvent(new Event('webglcontextrestored'))
      expect(nextFramePaints()).toBe(false)
      detach = () => undefined
    })
  })
})
