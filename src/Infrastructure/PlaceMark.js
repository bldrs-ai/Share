import {
  EventDispatcher,
  Mesh,
  Vector2,
  Vector3,
  Raycaster,
} from 'three'
import {IfcContext} from 'web-ifc-viewer/dist/components'
import debug from '../utils/debug'
import {floatStrTrim} from '../utils/strings'
import {disposeGroup, getSvgGroupFromObj, getSvgObjFromUrl} from '../utils/svg'
import {isDevMode} from '../utils/common'
import {BlendFunction} from 'postprocessing'


const tempScale = new Vector3()


export const PLACE_MARK_DISTANCE = 1
export const INACTIVE_PLACE_MARK_HEIGHT = 1
export const ACTIVE_PLACE_MARK_SCALE = 1.6
export const PLACE_MARK_SCALE_FACTOR = 60


/**
 * PlaceMark to share notes
 */
export default class PlaceMark extends EventDispatcher {
  /**
   * @param {IfcContext} context
   */
  constructor({context, postProcessor}) {
    super()
    debug().log('PlaceMark#constructor: context: ', context)
    const _domElement = context.getDomElement()
    const _camera = context.getCamera()
    const _scene = context.getScene()
    const outlineEffect = postProcessor.createOutlineEffect({
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 1.5,
      pulseSpeed: 0.0,
      visibleEdgeColor: 0xc7c7c7,
      hiddenEdgeColor: 0xff9b00,
      height: window.innerHeight,
      windth: window.innerWidth,
      blur: false,
      xRay: true,
      opacity: 1,
    })
    const composer = postProcessor.getComposer
    const _pointer = new Vector2()
    let _objects = []
    const _placeMarks = []
    const _raycaster = new Raycaster()


    this.activated = false
    _domElement.style.touchAction = 'none' // disable touch scroll


    this.activate = () => {
      this.activated = true
      _domElement.style.cursor = 'alias'
    }


    this.deactivate = () => {
      this.activated = false
      _domElement.style.cursor = 'default'
    }


    this.setObjects = (objects) => {
      _objects = objects
    }


    this.onSceneDoubleClick = (event) => {
      let res = {}

      switch (event.button) {
        case 0: // Main button (left button)
          res = dropPlaceMark(event)
          break
        case 1: // Wheel button (middle button if present)
          break
        // eslint-disable-next-line no-magic-numbers
        case 2: // Secondary button (right button)
          break
        // eslint-disable-next-line no-magic-numbers
        case 3: // Fourth button (back button)
          break
        // eslint-disable-next-line no-magic-numbers
        case 4: // Fifth button (forward button)
          break
        default:
          break
      }

      return res
    }


    this.onSceneClick = (event) => {
      let res = {}

      switch (event.button) {
        case 0: // Main button (left button)
          if (event.shiftKey) {
            res = dropPlaceMark(event)
          } else {
            res = getIntersectionPlaceMarkInfo()
          }
          break
        case 1: // Wheel button (middle button if present)
          break
        // eslint-disable-next-line no-magic-numbers
        case 2: // Secondary button (right button)
          break
        // eslint-disable-next-line no-magic-numbers
        case 3: // Fourth button (back button)
          break
        // eslint-disable-next-line no-magic-numbers
        case 4: // Fifth button (forward button)
          break
        default:
          break
      }

      return res
    }


    const dropPlaceMark = (event) => {
      let res = {}
      if (isDevMode()) {
        this.activated = true
      }

      if (_objects && this.activated) {
        updatePointer(event)
        const _intersections = []
        _intersections.length = 0
        _raycaster.setFromCamera(_pointer, _camera)
        _raycaster.intersectObjects(_objects, true, _intersections)
        debug().log('PlaceMark#dropPlaceMark: _intersections: ', _intersections)

        if (_intersections.length > 0) {
          const intersectPoint = _intersections[0].point
          intersectPoint.x = floatStrTrim(intersectPoint.x)
          intersectPoint.y = floatStrTrim(intersectPoint.y)
          intersectPoint.z = floatStrTrim(intersectPoint.z)
          const offset = _intersections[0].face.normal.clone().multiplyScalar(PLACE_MARK_DISTANCE)
          debug().log('PlaceMark#dropPlaceMark: offset: ', offset)
          const point = intersectPoint.add(offset)
          const lookAt = point.add(_intersections[0].face.normal)
          const promiseGroup = this.putDown({point, lookAt})
          res = {point, lookAt, promiseGroup}
        }
      }

      return res
    }


    this.putDown = ({point, lookAt, fillColor = 'black', height = INACTIVE_PLACE_MARK_HEIGHT}) => {
      debug().log('PlaceMark#putDown: point: ', point)
      debug().log('PlaceMark#putDown: lookAt: ', lookAt) // Not using yet since place mark always look at front
      return new Promise((resolve, reject) => {
        getSvgObjFromUrl('/icons/PlaceMark.svg').then((svgObj) => {
          const _placeMark = getSvgGroupFromObj({svgObj, fillColor, layer: 'placemark', height})
          _placeMark.position.copy(point)
          _scene.add(_placeMark)
          _placeMarks.push(_placeMark)
          debug().log('PlaceMark#putDown#getSvgGroupFromObj: _placeMarks: ', _placeMarks)
          const placeMarkMeshSet = getPlaceMarkMeshSet()
          debug().log('PlaceMark#putDown#getSvgGroupFromObj: placeMarkMeshSet: ', placeMarkMeshSet)
          debug().log('PlaceMark#putDown#getSvgGroupFromObj: placeMarkMeshSet.size: ', placeMarkMeshSet.size)
          outlineEffect.setSelection(placeMarkMeshSet)
          resolve(_placeMark)
        })
      })
    }


    this.disposePlaceMark = (_placeMark) => {
      debug().log('PlaceMark#disposePlaceMark: before place marks count: ', _placeMarks.length)
      const index = _placeMarks.indexOf(_placeMark)

      if (index > -1) {
        _placeMarks.splice(index, 1)
        disposeGroup(_placeMark)
        _scene.remove(_placeMark)
      }

      debug().log('PlaceMark#disposePlaceMark: after place marks count: ', _placeMarks.length)
      debug().log('PlaceMark#disposePlaceMark: _scene: ', _scene)
    }


    const updatePointer = (event) => {
      const rect = _domElement.getBoundingClientRect()
      // eslint-disable-next-line no-magic-numbers, no-mixed-operators
      _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      // eslint-disable-next-line no-magic-numbers, no-mixed-operators
      _pointer.y = (-(event.clientY - rect.top) / rect.height) * 2 + 1
    }


    const getIntersectionPlaceMarkInfo = () => {
      let res = {}
      debug().log('PlaceMark#getIntersectionPlaceMarkInfo: _placeMarks: ', _placeMarks)

      if (_placeMarks.length) {
        updatePointer(event)
        const _intersections = []
        _intersections.length = 0
        _raycaster.setFromCamera(_pointer, _camera)
        _raycaster.intersectObjects(_placeMarks, true, _intersections)
        debug().log('PlaceMark#getIntersectionPlaceMarkInfo: _intersections: ', _intersections)
        if (_intersections.length) {
          res = {url: _intersections[0].object?.userData?.url}
        }
      }

      return res
    }


    const getPlaceMarkMeshSet = () => {
      const placeMarkMeshSet = new Set()
      _placeMarks.forEach((placeMark) => {
        placeMark.traverse((child) => {
          if (child instanceof Mesh) {
            placeMarkMeshSet.add(child)
          }
        })
      })
      debug().log('PlaceMark#getPlaceMarkMeshes: placeMarkMeshSet: ', placeMarkMeshSet)
      return placeMarkMeshSet
    }


    const newRendererUpdate = () => {
      /**
       * Overrides the default update function in the context renderer
       *
       * @param {number} _delta
       */
      function newUpdateFn(_delta) {
        if (!context) {
          return
        }

        _placeMarks.forEach((_placeMark) => {
          _placeMark.quaternion.copy(_camera.quaternion)
          const dist = _placeMark.position.distanceTo(_camera.position)
          const sideScale = dist / PLACE_MARK_SCALE_FACTOR
          tempScale.set(sideScale, sideScale, sideScale)
          if (_placeMark.userData.isActive) {
            tempScale.multiplyScalar(ACTIVE_PLACE_MARK_SCALE)
          }
          _placeMark.scale.copy(tempScale)
        })

        composer.render()
      }

      return newUpdateFn.bind(context.renderer)
    }


    if (context.renderer) {
      // eslint-disable-next-line max-len
      // This patch applies to https://github.com/IFCjs/web-ifc-viewer/blob/9ce3a42cb8d4ffd5b78b19d56f3b4fad2d1f3c0e/viewer/src/components/context/renderer/renderer.ts#L44
      context.renderer.update = newRendererUpdate()
    }
  }
}
