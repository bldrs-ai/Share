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
  constructor({context, postProcessor}) {
    super()
    const _domElement = context.getDomElement()
    const _camera = context.getCamera()
    // Assign the camera to the global window object for Cypress testing
    if (OAUTH_2_CLIENT_ID === 'cypresstestaudience') {
    if (!window.markerScene) {
      window.markerScene = {}
    }
      window.markerScene.domElement = _domElement
      window.markerScene.camera = _camera
    }
    const _scene = context.getScene()
    const _raycaster = new Raycaster()
    let _objects = []
    const _placeMarks = []

    this.activated = false
    _domElement.style.touchAction = 'none'
    const _pointer = new Vector2()

    this.activate = () => {
      this.activated = true
      _domElement.style.cursor = 'alias'
    }

    this.deactivate = () => {
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
        const _intersections = []
        _raycaster.setFromCamera(_pointer, _camera)
        _raycaster.intersectObjects(_objects, true, _intersections)

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

      if (event.button === 0) {
        res = dropPlaceMark(event)
      }

      return res
    }

    this.onSceneClick = (event) => {
      let res = {}

      if (event.button === 0) {
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

    this.putDown = ({point, normal, fillColor = 0xA9A9A9/* 0xff0000*/, active}) => {
      return new Promise((resolve, reject) => {
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

      // Dispose of any other resources if necessary
      }
    }

    this.disposePlaceMark = (_placeMark) => {
      const index = _placeMarks.indexOf(_placeMark)

      if (index > -1) {
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
          return placemark
        })
        .catch((err) => {
          throw err
        })
    }

    const createCircleTexture = (fillColor) => {
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

    const updatePlacemarksVisibility = () => {
      const camPos = _camera.position
      _placeMarks.forEach((placemark) => {
        // Normal size in screen
        // placemark.scale.set(PLACEMARK_SIZE, PLACEMARK_SIZE, PLACEMARK_SIZE)
        const distance = placemark.position.distanceTo(camPos)
        // Clamped-interpoliation
        // const scale = getScaleForDistance(distance, minDist, maxDist, minScale, maxScale)
        // Fixed size
        const scale = baselineScale * (distance / baselineDistance)
        placemark.scale.set(scale, scale, scale)
      })
    }

    this.onRender = () => {
      updatePlacemarksVisibility()
      _placeMarks.sort((a, b) =>
        a.position.distanceTo(_camera.position) - b.position.distanceTo(_camera.position))
      requestAnimationFrame(this.onRender)
    }

    requestAnimationFrame(this.onRender)
  }
}

// For normal sizing
// const PLACEMARK_SIZE = 2.5
const PLACE_MARK_DISTANCE = 0
