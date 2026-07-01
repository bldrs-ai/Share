// OrbitControl — vendored from
// `web-ifc-viewer/dist/components/context/camera/controls/orbit-control.js`
// in slice 5d.3.

import {Box3, MathUtils, Sphere, Vector3} from 'three'
import {IfcComponent, NavigationModes} from '../../base-types'
import {LiteEvent} from '../../LiteEvent'


export class OrbitControl extends IfcComponent {
  constructor(context, ifcCamera) {
    super(context)
    this.context = context
    this.ifcCamera = ifcCamera
    this.enabled = true
    this.mode = NavigationModes.Orbit
    this.onChange = new LiteEvent()
    this.onUnlock = new LiteEvent()
    this.onChangeProjection = new LiteEvent()
    this.activateOrbitControls()
  }
  /**
   * @deprecated Use cameraControls.getTarget.
   */
  get target() {
    const target = new Vector3()
    this.ifcCamera.cameraControls.getTarget(target)
    return target
  }
  toggle(active) {
    this.enabled = active
    if (active) {
      this.activateOrbitControls()
    }
  }
  async fitModelToFrame() {
    if (!this.enabled) {
      return
    }
    const scene = this.context.getScene()
    // TODO(#1561): frame the loader's named primary-model object, not the
    // last scene child. Lights/helpers/isolation subsets appended after the
    // model can otherwise become the framing target.
    const framed = scene.children[scene.children.length - 1]
    const box = new Box3().setFromObject(framed)
    // TEMP diagnostic (batched over-zoom): identify exactly what the fit
    // frames and whether its world transform carries the coordination matrix.
    try {
      const e = framed?.matrixWorld?.elements
      console.info(
        `[fitDiag v2] framed type=${framed?.type} name="${framed?.name}" uuid=${framed?.uuid?.slice(0, 8)} ` +
        `isGroup=${!!framed?.isGroup} children=${framed?.children?.length} ` +
        `matrixWorldTranslation=[${e ? [e[12].toFixed(1), e[13].toFixed(1), e[14].toFixed(1)] : '?'}] ` +
        `boxMin=[${box.min.toArray().map((n) => n.toFixed(1))}] boxMax=[${box.max.toArray().map((n) => n.toFixed(1))}]`)
      let biggest = null
      let biggestR = 0
      scene.children.forEach((c) => {
        const cb = new Box3().setFromObject(c)
        const r = cb.isEmpty() ? 0 : cb.getSize(new Vector3()).length()
        if (r > biggestR) {
          biggestR = r
          biggest = c
        }
      })
      console.info(`[fitDiag v2] biggestChild type=${biggest?.type} diag=${biggestR.toFixed(1)} sceneChildCount=${scene.children.length}`)
      // Dump every descendant of the framed object whose WORLD box is large,
      // with its cached boundingBox, geometry boundingBox, and matrixWorld
      // scale/translation — pinpoints whether a child's bounds or transform
      // blew up between the two fits.
      const fmt = (b) => b ? `[${b.min.toArray().map((n) => n.toFixed(0))}]→[${b.max.toArray().map((n) => n.toFixed(0))}]` : 'null'
      ;(framed?.children ?? []).forEach((c, i) => {
        const cb = new Box3().setFromObject(c)
        console.info(
          `[fitDiag v2]   child[${i}] type=${c.type} isBatched=${!!c.isBatchedMesh} visible=${c.visible} ` +
          `name="${c.name}" uuid=${c.uuid?.slice(0, 8)} grandkids=${c.children?.length} ` +
          `worldBox=${fmt(cb)}`)
      })
      framed?.traverse?.((o) => {
        const wb = new Box3().setFromObject(o)
        if (wb.isEmpty() || wb.getSize(new Vector3()).length() < 100) {
          return
        }
        const me = o.matrixWorld.elements
        let maxTrans = -1
        let instCount = -1
        if (o.isBatchedMesh && typeof o.getMatrixAt === 'function') {
          const p = new Vector3()
          const mat = o.matrixWorld.clone()
          instCount = o.instanceParents?.length ?? -1
          maxTrans = 0
          for (let b = 0; b < instCount; b++) {
            o.getMatrixAt(b, mat)
            p.setFromMatrixPosition(mat)
            const mag = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z))
            if (mag > maxTrans) {
              maxTrans = mag
            }
          }
        }
        console.info(
          `[fitDiag v2]   node type=${o.type} isBatched=${!!o.isBatchedMesh} visible=${o.visible} ` +
          `name="${o.name}" uuid=${o.uuid?.slice(0, 8)} parentType=${o.parent?.type} parentUuid=${o.parent?.uuid?.slice(0, 8)} ` +
          `objBox=${fmt(o.boundingBox)} geomBox=${fmt(o.geometry?.boundingBox)} ` +
          `mwScale=[${me[0].toFixed(2)},${me[5].toFixed(2)},${me[10].toFixed(2)}] ` +
          `mwTrans=[${me[12].toFixed(0)},${me[13].toFixed(0)},${me[14].toFixed(0)}] ` +
          `instCount=${instCount} maxInstTrans=${maxTrans.toFixed(1)} worldBox=${fmt(wb)}`)
      })
    } catch (e) {
      console.warn('[fitDiag v2] framed-object diag failed', e)
    }

    // True enclosing sphere of the model (half the box diagonal). The old
    // `max(x,y,z) * 0.5` used half the longest *edge*, which under-sizes the
    // sphere for any non-slab model — fitToSphere then parked the camera too
    // close and the model overflowed the frame.
    const sphere = new Sphere()
    box.getBoundingSphere(sphere)

    // Leave ~1/3 of the canvas as whitespace (≈1/6 per side): inflate the
    // framed sphere so the model fills ~2/3 of the viewport rather than
    // sitting edge-to-edge.
    const FRAMING_MARGIN = 1.5
    sphere.radius *= FRAMING_MARGIN

    // Distance camera-controls will dolly to for `sphere`, mirroring its
    // getDistanceToFitSphere (radius / sin(½·limitingFOV); the limiting FOV is
    // the narrower of the two axes). Computed here so the zoom limits below
    // scale with the model instead of the old hardcoded cap.
    const camera = this.ifcCamera.perspectiveCamera
    const vFov = MathUtils.degToRad(camera.fov)
    const hFov = Math.atan(Math.tan(vFov * 0.5) * camera.aspect) * 2
    const limitingFov = camera.aspect > 1 ? vFov : hFov
    const fitDistance = sphere.radius / Math.sin(limitingFov * 0.5)

    const controls = this.ifcCamera.cameraControls
    // Allow zooming out to 10x the fit distance (model shrinks to ~1/10 of the
    // canvas) and well in. Replaces the hardcoded maxDistance = 300 that
    // clamped fitToSphere on large models — pinning the camera too close and
    // capping zoom-out before the whole model was visible.
    controls.minDistance = fitDistance * 0.01
    controls.maxDistance = fitDistance * 10

    // Keep the model between the near/far planes across the whole zoom range:
    // far must clear the pulled-back camera (maxDistance + model radius), near
    // must stay inside the closest dolly. Without this, zooming out on a large
    // model would clip it against the old far = 2000 plane.
    camera.near = Math.max(controls.minDistance * 0.5, 0.1)
    camera.far = (controls.maxDistance + sphere.radius) * 1.5
    camera.updateProjectionMatrix()

    // TEMP diagnostic (batched over-zoom on Schependomlaan): the fit box is
    // correct (~24m) yet the model shows as a far dot in batched mode. Logged
    // SYNCHRONOUSLY (before the await, which may never resolve if the
    // transition is interrupted) so it always fires — the `v2` tag confirms
    // the freshly-deployed bundle is running. A deferred read reports where
    // the camera actually settled, distinguishing "camera parked wrong" from
    // "geometry rendered small". Remove once resolved.
    const cam = this.ifcCamera.perspectiveCamera
    console.info(
      `[fitDiag v2] sphereR=${sphere.radius.toFixed(1)} fitDistance=${fitDistance.toFixed(1)} ` +
      `preFitCamDist=${cam.position.distanceTo(sphere.center).toFixed(1)} ` +
      `near=${camera.near.toFixed(2)} far=${camera.far.toFixed(1)} ` +
      `sphereCenter=[${sphere.center.x.toFixed(1)},${sphere.center.y.toFixed(1)},${sphere.center.z.toFixed(1)}]`)
    const c = sphere.center.clone()
    setTimeout(() => {
      console.info(
        `[fitDiag v2] settled camPos=[${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},` +
        `${cam.position.z.toFixed(1)}] settledCamDistToCenter=${cam.position.distanceTo(c).toFixed(1)}`)
    }, 1500)

    await controls.fitToSphere(sphere, true)
  }
  activateOrbitControls() {
    const controls = this.ifcCamera.cameraControls
    controls.minDistance = 1
    controls.maxDistance = 300
    this.ifcCamera.cameraControls.truckSpeed = 2
  }
}
// # sourceMappingURL=orbit-control.js.map
