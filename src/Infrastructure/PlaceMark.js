const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID
import {
  EventDispatcher,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Vector2,
  Raycaster,
  Matrix3,
} from 'three'
import {isDevMode} from '../utils/common'
import {floatStrTrim} from '../utils/strings'
import {requestPaint} from '../viewer/three/renderDemand'
import {visibleHits} from '../viewer/three/visibleHits'


/**
 * Class representing a PlaceMark in a 3D scene.
 * Handles creation, rendering, occlusion detection, and selection of placemarks.
 */
export default class PlaceMark extends EventDispatcher {
  /**
   * Creates a new PlaceMark instance.
   *
   * @param {object} options - Options for the PlaceMark.
   * @param {object} options.context - Rendering context providing access to DOM
   *     element, camera, and scene.
   * @param {object} options.postProcessor - Post-processing effects applied to the scene.
   */
  constructor({context}) {
    super()
    // The viewer this instance draws into. Bound once: a new viewer (theme
    // change, model switch) gets a new PlaceMark, and this one is disposed
    // (MarkerControl's init effect, #2017). `let` so `dispose` can drop
    // them: a stale holder of a disposed PlaceMark then keeps no viewer
    // reachable.
    let _context = context
    let _domElement = context.getDomElement()
    let _camera = context.getCamera()
    // HACK(pablo): Assign the camera to the global window object for Cypress testing
    if (OAUTH_2_CLIENT_ID === 'cypresstestaudience') {
      if (!window.markerScene) {
        window.markerScene = {}
      }
      window.markerScene.domElement = _domElement
      window.markerScene.camera = _camera
    }

    let _scene = context.getScene()
    const _raycaster = new Raycaster()
    let _objects = []
    const _placeMarks = []
    let _isDisposed = false

    this.activated = false
    _domElement.style.touchAction = 'none'
    const _pointer = new Vector2()

    this.activate = () => {
      if (_isDisposed) {
        return
      }
      this.activated = true
      _domElement.style.cursor = 'alias'
    }

    this.deactivate = () => {
      if (_isDisposed) {
        return
      }
      this.activated = false
      _domElement.style.cursor = 'default'
    }

    this.setObjects = (objects) => {
      if (!Array.isArray(objects) || objects.length === 0) {
        console.error('PlaceMark#setObjects: \'objects\' must be a non-empty array.')
        return
      }
      _objects = objects
    }

    const dropPlaceMark = (event) => {
      let res = {}
      if (isDevMode()) {
        this.activated = true
      }

      if (_objects && this.activated) {
        updatePointer(event)
        _raycaster.setFromCamera(_pointer, _camera)
        // The model, so through visibleHits like Picker#castRay: not at a
        // NaN-distance hit three r187 reports for a NaN-vertex triangle, not
        // on geometry a cut plane removed from view (#2131), and not on the
        // model behind the cut-plane gizmo.
        const _intersections = visibleHits(_raycaster.intersectObjects(_objects, true), _raycaster, _context)

        if (_intersections.length > 0) {
          const intersect = _intersections[0]
          const intersectPoint = intersect.point.clone()
          intersectPoint.x = floatStrTrim(intersectPoint.x)
          intersectPoint.y = floatStrTrim(intersectPoint.y)
          intersectPoint.z = floatStrTrim(intersectPoint.z)

          if (intersect.face && intersect.object) {
            const normal = intersect.face.normal.clone().applyMatrix3(
              new Matrix3().getNormalMatrix(intersect.object.matrixWorld))
            const offset = normal.clone().multiplyScalar(PLACE_MARK_DISTANCE)
            const point = intersectPoint.add(offset)
            const promiseGroup = this.putDown({point, normal, active: false})

            res = {point, normal, promiseGroup}
          }
        }
      }

      return res
    }

    this.onSceneDoubleClick = (event) => {
      let res = {}

      if (event.button === 0 && !_isDisposed) {
        res = dropPlaceMark(event)
      }

      return res
    }

    this.onSceneClick = (event) => {
      let res = {}

      if (event.button === 0 && !_isDisposed) {
        if (event.shiftKey) {
          res = dropPlaceMark(event)
        } else {
          res = getIntersectionPlaceMarkInfo()
          /* if (res.marker) {
            toggleMarkerSelection(res.marker)
            event.stopPropagation()
            event.preventDefault()
          }*/
        }
      }

      return res
    }

    /**
     * Resolves to the new marker, or to null once this PlaceMark is disposed
     * (a placement that was in flight when its viewer went away).
     *
     * @return {Promise<object|null>}
     */
    this.putDown = ({point, normal, fillColor = 0xA9A9A9/* 0xff0000*/}) => {
      return new Promise((resolve, reject) => {
        if (_isDisposed) {
          resolve(null)
          return
        }
        if (!normal) {
          reject(new Error('Normal vector is not defined.'))
          return
        }
        createCirclePlacemark(point, fillColor)
          .then((mark) => resolve(mark))
          .catch((e) => reject(e))
      })
    }

    this.disposePlaceMarks = () => {
      // Remove all place marks from the scene
      if (_placeMarks) {
        _placeMarks.forEach((placemark) => {
          _scene.remove(placemark)
          if (placemark.material.map) {
            placemark.material.map.dispose()
          }
          placemark.material.dispose()
        })
        _placeMarks.length = 0
      }
    }

    // A no-op once disposed: `dispose` has already taken every marker out
    // of the scene, and none can land after it (createCirclePlacemark).
    this.disposePlaceMark = (_placeMark) => {
      const index = _placeMarks.indexOf(_placeMark)

      if (index > -1 && !_isDisposed) {
        _placeMarks.splice(index, 1)
        _scene.remove(_placeMark)
      }
    }

    /**
     * Returns all active placemarks.
     *
     * @return {Array} Array of placemark objects.
     */
    this.getPlacemarks = () => {
      return _placeMarks
    }

    const updatePointer = (event) => {
      const rect = _domElement.getBoundingClientRect()
      // eslint-disable-next-line no-mixed-operators
      _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      // eslint-disable-next-line no-mixed-operators
      _pointer.y = (-(event.clientY - rect.top) / rect.height) * 2 + 1
    }

    const getIntersectionPlaceMarkInfo = () => {
      let res = {}

      if (_placeMarks.length) {
        updatePointer(event)
        const _intersections = []
        _raycaster.setFromCamera(_pointer, _camera)
        _raycaster.intersectObjects(_placeMarks, true, _intersections)
        if (_intersections.length) {
          res = {marker: _intersections[0].object}
        }
      }

      return res
    }

    const createCirclePlacemark = (position, fillColor) => {
      return createCircleTexture(fillColor)
        .then((texture) => {
          // The texture loads async, so the viewer can be gone by now; its
          // scene must not get a marker after this PlaceMark let it go.
          if (_isDisposed) {
            texture.dispose()
            return null
          }
          const material = new SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
          })
          const placemark = new Sprite(material)
          placemark.position.copy(position)
          placemark.renderOrder = 999 // High render order to ensure it's drawn last
          // placemark.material.color.set(0xffffff)
          _scene.add(placemark)
          _placeMarks.push(placemark)
          // Hooked through Object3D#add too (renderDemandHooks.js); the
          // marker's texture arrived async, so ask for the frame that shows it.
          requestPaint()
          return placemark
        })
        .catch((err) => {
          throw err
        })
    }

    const createCircleTexture = () => {
      const sW = 24
      const sH = 24
      // Base color should be white. Dynamic coloring tints the base color, so
      // need white to give unbiased tinting so that
      // e.g. material.color.set(0xff0000) will render as 0xff0000 on screen and
      // not a blend.
      // Share is from @mui/icons-material/Place
      const icon = `<svg viewBox="0 0 ${sW} ${sH}" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7m0
                 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5"
        fill="#ffffff"/>
      </svg>`
      const oversample = 4
      const width = sW * oversample
      const height = sH * oversample
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      const img = new Image()
      const svgBlob = new Blob([icon], {type: 'image/svg+xml'})
      const url = URL.createObjectURL(svgBlob)
      return new Promise((resolve) => {
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          // ctx.imageSmoothingEnabled = false
          ctx.drawImage(img, 0, 0, width, height)
          URL.revokeObjectURL(url)
          resolve(new CanvasTexture(canvas))
        }
        img.src = url
      })
    }

    // For clamped-interpolation
    /**
     * Smoothstep easing function for non-linear interpolation.
     *
     * @return {number} interpolated X
     */
    /*
    function smoothstep(edge0, edge1, x) {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
      return t * t * (3 - (2 * t))
    }
    */

    /**
     * Smoothstep easing function for non-linear interpolation.
     *
     * @return {number} scale
     */
    /*
    function getScaleForDistance(distance, minDist, maxDist, minScale, maxScale) {
      const clampedDist = Math.min(Math.max(distance, minDist), maxDist)
      const normalized = (clampedDist - minDist) / (maxDist - minDist)
      const easedT = smoothstep(0, 1, normalized)
      return minScale + (easedT * (maxScale - minScale))
    }

    const minDist = 1
    const maxDist = 2
    const minScale = 8
    const maxScale = 10
    */

    const baselineDistance = 20 // e.g., at 100 units from camera, scale = 1
    const baselineScale = 1

    /**
     * Keep each marker a fixed size on screen: scale it with its distance
     * from the camera.
     *
     * @return {boolean} whether any marker's scale changed
     */
    const updatePlacemarksVisibility = () => {
      const camPos = _camera.position
      let isRescaled = false
      _placeMarks.forEach((placemark) => {
        // Normal size in screen
        // placemark.scale.set(PLACEMARK_SIZE, PLACEMARK_SIZE, PLACEMARK_SIZE)
        const distance = placemark.position.distanceTo(camPos)
        // Clamped-interpoliation
        // const scale = getScaleForDistance(distance, minDist, maxDist, minScale, maxScale)
        // Fixed size
        const scale = baselineScale * (distance / baselineDistance)
        if (placemark.scale.x !== scale || placemark.scale.y !== scale || placemark.scale.z !== scale) {
          placemark.scale.set(scale, scale, scale)
          isRescaled = true
        }
      })
      return isRescaled
    }

    /**
     * One frame of upkeep, run by the viewer's own loop before its paint
     * under `?feature=renderOnDemand` (ThreeContext#onFrame). It used to be a
     * rAF loop of its own, started twice and never stopped, that ran after
     * the viewer's paint: a marker restored from a note starts at scale 1,
     * the loop then rescaled it, and a viewer painting on demand kept the
     * scale-1 frame up until something else painted (codex on #2096). A
     * transform is no change the render-on-demand hooks see, so a rescale
     * asks for its paint.
     */
    this.update = () => {
      if (_isDisposed) {
        return
      }
      if (updatePlacemarksVisibility()) {
        requestPaint()
      }
      _placeMarks.sort((a, b) =>
        a.position.distanceTo(_camera.position) - b.position.distanceTo(_camera.position))
    }

    // A context stand-in without the frame hook (unit tests) gets no upkeep.
    // `let`: the unsubscribe closes over the context, so dispose drops it too.
    let stopFrames = context.onFrame?.(this.update) ?? (() => undefined)

    /** @return {boolean} whether `dispose` has run */
    this.isDisposed = () => _isDisposed

    /**
     * Let the viewer go: stop the per-frame upkeep, take the markers out of
     * the scene and free their materials and textures, and drop every
     * reference to the context's scene, camera, canvas and model. Until
     * #2017 nothing called this, so a re-created viewer (the theme toggle,
     * CadView.jsx#onModelPath) left the store's PlaceMark drawing into the
     * disposed scene, and that scene reachable from the store. Idempotent.
     */
    this.dispose = () => {
      if (_isDisposed) {
        return
      }
      stopFrames()
      stopFrames = () => undefined
      this.disposePlaceMarks()
      _isDisposed = true
      this.activated = false
      // The Playwright build's test hook (top of the constructor) points at
      // the newest PlaceMark's canvas and camera; drop them if they are ours.
      if (window.markerScene) {
        if (window.markerScene.camera === _camera) {
          delete window.markerScene.camera
        }
        if (window.markerScene.domElement === _domElement) {
          delete window.markerScene.domElement
        }
      }
      _objects = []
      _context = null
      _scene = null
      _camera = null
      _domElement = null
    }
  }
}

// For normal sizing
// const PLACEMARK_SIZE = 2.5
const PLACE_MARK_DISTANCE = 0
