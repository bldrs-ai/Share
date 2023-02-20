import {
  EventDispatcher,
  Raycaster,
  Vector2,
} from 'three'
import {IfcContext} from 'web-ifc-viewer/dist/components'
import {PLACE_MARK_DISTANCE} from '../utils/constants'
import debug from '../utils/debug'
import {floatStrTrim} from '../utils/strings'
// eslint-disable-next-line no-unused-vars
import {getSVGGroup, getSVGMesh, getSVGSprite} from '../utils/svg'
// import createComposer from './CustomPostProcessing'


/**
 * PlaceMark to share notes
 */
export default class PlaceMark extends EventDispatcher {
  /**
   * @param {IfcContext} context
   */
  constructor(context) {
    super()
    debug().log('PlaceMark#constructor: context: ', context)
    const _domElement = context.getDomElement()
    const _camera = context.getCamera()
    const _scene = context.getScene()
    // const _renderer = context.getRenderer()
    // const {composer, outlineEffect} = createComposer(_renderer, _scene, _camera)
    const _raycaster = new Raycaster()
    const _pointer = new Vector2()
    let _objects = []
    const _placeMarks = []


    this.activated = false
    _domElement.style.touchAction = 'none' // disable touch scroll
    // context.renderer.update = newUpdateFunction(context, composer)


    const updatePointer = (event) => {
      const rect = _domElement.getBoundingClientRect()
      // eslint-disable-next-line no-magic-numbers, no-mixed-operators
      _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      // eslint-disable-next-line no-magic-numbers, no-mixed-operators
      _pointer.y = (-(event.clientY - rect.top) / rect.height) * 2 + 1
    }


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


    this.onDrop = (event) => {
      debug().log('PlaceMark#onDrop: ', event)
      if (!_objects || !this.activated) {
        return
      }
      updatePointer(event)
      const _intersections = []
      _intersections.length = 0
      _raycaster.setFromCamera(_pointer, _camera)
      _raycaster.intersectObjects(_objects, true, _intersections)
      debug().log('PlaceMark#onDrop: _intersections: ', _intersections)

      if (_intersections.length > 0) {
        const intersectPoint = _intersections[0].point.clone()
        intersectPoint.x = floatStrTrim(intersectPoint.x)
        intersectPoint.y = floatStrTrim(intersectPoint.y)
        intersectPoint.z = floatStrTrim(intersectPoint.z)
        const offset = _intersections[0].face.normal.clone().multiplyScalar(PLACE_MARK_DISTANCE)
        debug().log('PlaceMark#onDrop: offset: ', offset)
        const point = intersectPoint.clone().add(offset)
        const lookAt = point.clone().add(_intersections[0].face.normal.clone())
        this.putDown({point, lookAt})
        return {point, lookAt}
      } else {
        return null
      }
    }

    this.putDown = ({point, lookAt, color = 'red'}) => {
      debug().log('PlaceMark#putDown: point: ', point)
      debug().log('PlaceMark#putDown: lookAt: ', lookAt)
      // getSVGGroup({
      //   url: '/icons/PlaceMark.svg',
      //   fillColor: 'red',
      // }).then((group) => {
      //   debug().log('PlaceMark#putDown#getSVGGroup: group: ', group)
      //   group.position.copy(point)
      //   if (lookAt) {
      //     group.lookAt(lookAt)
      //   }
      //   _scene.add(group)
      //   _placeMarks.push(group)
      // })
      // getSVGMesh({
      //   url: '/icons/PlaceMark.svg',
      //   fillColor: 'red',
      // }).then((mesh) => {
      //   debug().log('PlaceMark#putDown#getSVGMesh: mesh: ', mesh)
      //   mesh.position.copy(point)
      //   if (lookAt) {
      //     mesh.lookAt(lookAt)
      //   }
      //   _scene.add(mesh)
      //   _placeMarks.push(mesh)
      // })
      getSVGSprite({
        url: '/icons/PlaceMark.svg',
        fillColor: 'red',
        width: 2,
        height: 3.6,
      }).then((sprite) => {
        debug().log('PlaceMark#putDown#getSVGMesh: sprite: ', sprite)
        sprite.position.copy(point)
        _scene.add(sprite)
        _placeMarks.push(sprite)
        // outlineEffect.setSelection(_placeMarks)
      })
    }
  }
}


// const newUpdateFunction = (context, composer) => {
//   /**
//    * Overrides the default update function in the context renderer
//    *
//    * @param {number} _delta
//    */
//   function newUpdateFn(_delta) {
//     // eslint-disable-next-line no-invalid-this
//     if (this.blocked || !context) {
//       return
//     }
//     composer.render()
//   }
//   return newUpdateFn.bind(context.renderer)
// }
