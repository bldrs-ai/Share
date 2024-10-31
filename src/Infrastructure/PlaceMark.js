import {
  EventDispatcher,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector2,
  Raycaster,
  Matrix3,
} from 'three'
import {OutlineEffect, BlendFunction} from 'postprocessing'
import {isDevMode} from '../utils/common'
import {floatStrTrim} from '../utils/strings'

/**
 * Placemark class
 */
export default class PlaceMark extends EventDispatcher {
  /**
   *
   * @param {context} context
   */
  constructor({context, postProcessor}) {
    super()
    const _domElement = context.getDomElement()
    const _camera = context.getCamera()
    const _scene = context.getScene()
    const _raycaster = new Raycaster()
    let _objects = []
    const _placeMarks = []
    const _selectedPlaceMarks = new Set()
    const _occludedPlaceMarks = new Set()

    this.activated = false
    _domElement.style.touchAction = 'none'
    const _pointer = new Vector2()

    // Configure outline effect for selected markers
    const selectedOutlineEffect = new OutlineEffect(_scene, _camera, {
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 2.0,
      pulseSpeed: 0.0,
      visibleEdgeColor: 0xffff00, // Yellow for selected markers
      hiddenEdgeColor: 0x000000, // Not used here
      xRay: false, // We don’t want selected outlines to show through objects
    })

    // Configure outline effect for occluded markers
    const occludedOutlineEffect = new OutlineEffect(_scene, _camera, {
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 1.5,
      pulseSpeed: 0.0,
      visibleEdgeColor: 0xff0000, // Red for occluded markers
      hiddenEdgeColor: 0xff0000, // Red for hidden edges
      xRay: true, // Enable X-ray mode to show outline through occluding objects
    })

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
            const promiseGroup = this.putDown({point, normal})

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
          if (res.marker) {
            toggleMarkerSelection(res.marker)
            // Prevent further propagation if `selectPlaceMark` is called
            event.stopPropagation()
            event.preventDefault()
          }
        }
      }

      return res
    }

    this.putDown = ({point, normal, fillColor = 0xff0000}) => {
      return new Promise((resolve, reject) => {
        if (!normal) {
          // eslint-disable-next-line prefer-promise-reject-errors
          reject('Normal vector is not defined.')
          return
        }
        const _placeMark = createSpherePlacemark(point, normal, fillColor)
        _scene.add(_placeMark)
        _placeMarks.push(_placeMark)
        resolve(_placeMark)
      })
    }

    this.disposePlaceMark = (_placeMark) => {
      const index = _placeMarks.indexOf(_placeMark)

      if (index > -1) {
        _placeMarks.splice(index, 1)
        _scene.remove(_placeMark)
      }
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

    const createSpherePlacemark = (position, normal, fillColor) => {
      // eslint-disable-next-line no-magic-numbers
      const geometry = new SphereGeometry(PLACE_MARK_SIZE, 16, 16)
      const material = new MeshBasicMaterial({color: fillColor})
      const placemark = new Mesh(geometry, material)

      placemark.position.copy(position)
      _scene.add(placemark)
      _placeMarks.push(placemark)
      toggleMarkerSelection(placemark)
      return placemark
    }

    const toggleMarkerSelection = (marker) => {
      // Deselect all other markers by setting them to gray
      _selectedPlaceMarks.forEach((selectedMarker) => {
        // eslint-disable-next-line no-magic-numbers
        selectedMarker.material.color.set(0xA9A9A9)
      })
      _selectedPlaceMarks.clear() // Clear the selected markers set

      // Add the new marker to selected markers and set color to red
      _selectedPlaceMarks.add(marker)
      // eslint-disable-next-line no-magic-numbers
      marker.material.color.set(0xff0000)

      updateOutlineEffect()
    }

    const updateOutlineEffect = () => {
      if ( selectedOutlineEffect.selection !== void 0) {
        selectedOutlineEffect.selection.set(Array.from(_selectedPlaceMarks))
      }

      if (occludedOutlineEffect.selection !== void 0) {
        occludedOutlineEffect.selection.set(Array.from(_occludedPlaceMarks))
      }
    }

    const checkOcclusion = () => {
      _placeMarks.forEach((placemark) => {
        _raycaster.set(_camera.position, placemark.position.clone().sub(_camera.position).normalize())
        const intersections = _raycaster.intersectObjects(_objects, true)
        const isOccluded = intersections.length > 0 && intersections[0].distance < placemark.position.distanceTo(_camera.position)

        if (isOccluded) {
          _occludedPlaceMarks.add(placemark)
        } else {
          _occludedPlaceMarks.delete(placemark)
        }
      })
      updateOutlineEffect()
    }

    const updatePlacemarksVisibility = () => {
      _placeMarks.forEach((placemark) => {
        placemark.quaternion.copy(_camera.quaternion) // Apply billboarding effect
        const distance = placemark.position.distanceTo(_camera.position)

        if (distance > MAX_VISIBLE_DISTANCE) {
          placemark.visible = false
        } else {
          placemark.visible = true
          const scale = distance / SCALE_FACTOR
          placemark.scale.set(scale, scale, scale) // Adjust scaling based on distance
        }
      })
      checkOcclusion() // Apply occlusion check in each frame update
    }

    this.onRender = () => {
      updatePlacemarksVisibility()
      _placeMarks.sort((a, b) => a.position.distanceTo(_camera.position) - b.position.distanceTo(_camera.position))
      // Request the next frame
      requestAnimationFrame(this.onRender)
    }

   // Start the render loop
   requestAnimationFrame(this.onRender)
  }
}

const PLACE_MARK_SIZE = 0.2
const SCALE_FACTOR = 300
const MAX_VISIBLE_DISTANCE = 200
const PLACE_MARK_DISTANCE = 0
