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
   * @param {object} options.context - Rendering context providing access to DOM element, camera, and scene.
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
        // eslint-disable-next-line no-console
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
            const normal = intersect.face.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(intersect.object.matrixWorld))
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
        const _placeMark = createCirclePlacemark(point, fillColor)

       // if (active) {
       //   toggleMarkerSelection(_placeMark)
       // }
        resolve(_placeMark)
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
      const texture = createCircleTexture(fillColor)
      const material = new SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false, // Disable depth testing
      })
      const placemark = new Sprite(material)
      placemark.position.copy(position)
      placemark.renderOrder = 999 // High render order to ensure it's drawn last
      placemark.material.color.set(fillColor)
      _scene.add(placemark)
      _placeMarks.push(placemark)
      // toggleMarkerSelection(placemark)
      return placemark
    }

    const createCircleTexture = (fillColor) => {
      const size = 64 // Texture size in pixels
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const canvasContext = canvas.getContext('2d')

      // Ensure the entire canvas is transparent initially
      canvasContext.clearRect(0, 0, size, size)

      // Draw the circle
      canvasContext.beginPath()
      // eslint-disable-next-line no-mixed-operators
      canvasContext.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2) // -2 for a slight border
      // eslint-disable-next-line no-magic-numbers
      canvasContext.fillStyle = `#${fillColor.toString(16).padStart(6, '0')}`
      canvasContext.fill()

      // Optionally add a border
      canvasContext.lineWidth = 2
      canvasContext.strokeStyle = '#000000'
      canvasContext.stroke()

      return new CanvasTexture(canvas)
    }

    /* const toggleMarkerSelection = (marker) => {
      _selectedPlaceMarks.forEach((selectedMarker) => {
        // eslint-disable-next-line no-magic-numbers
        selectedMarker.material.color.set(0xA9A9A9)
      })
      _selectedPlaceMarks.clear()
      _selectedPlaceMarks.add(marker)
      // eslint-disable-next-line no-magic-numbers
      marker.material.color.set(0xff0000)
    }*/

    const updatePlacemarksVisibility = () => {
      _placeMarks.forEach((placemark) => {
        placemark.scale.set(PLACEMARK_SIZE, PLACEMARK_SIZE, PLACEMARK_SIZE)
      })
    }

    this.onRender = () => {
      updatePlacemarksVisibility()
      _placeMarks.sort((a, b) => a.position.distanceTo(_camera.position) - b.position.distanceTo(_camera.position))
      requestAnimationFrame(this.onRender)
    }

    requestAnimationFrame(this.onRender)
  }
}

const PLACEMARK_SIZE = 2.5
const PLACE_MARK_DISTANCE = 0
