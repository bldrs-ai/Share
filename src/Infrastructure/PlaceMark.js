import {
  EventDispatcher,
  Raycaster,
  Scene,
  Vector2,
} from 'three'
import {IfcContext} from 'web-ifc-viewer/dist/components'
import {PLACE_MARK_DISTANCE} from '../utils/constants'
import debug from '../utils/debug'
import {floatStrTrim} from '../utils/strings'
// eslint-disable-next-line no-unused-vars
import {getSVGGroup, getSVGMesh, getSVGSprite} from '../utils/svg'


/**
 * PlaceMark to share notes
 */
export default class PlaceMark extends EventDispatcher {
  /**
   * @param {IfcContext} context
   */
  constructor({context}) {
    super()
    debug().log('PlaceMark#constructor: context: ', context)
    const _domElement = context.getDomElement()
    const _camera = context.getCamera()
    const _renderer = context.getRenderer()
    const _markScene = new Scene()
    const _raycaster = new Raycaster()
    const _pointer = new Vector2()
    let _objects = []
    const _placeMarks = []


    this.activated = false
    _domElement.style.touchAction = 'none' // disable touch scroll


    this.updatePointer = (event) => {
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
      this.updatePointer(event)
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
      //   _markScene.add(group)
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
      //   _markScene.add(mesh)
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
        _markScene.add(sprite)
        _placeMarks.push(sprite)
      })
    }


    /**
     * This is a custom render pass that allows both IFC.js's scene and a new Three.js scene to be rendered on the same canvas
     */
    this.renderPatch = () => {
      if (context.isThisBeingDisposed) {
        return
      }
      if (context.stats) {
        context.stats.begin()
      }
      _renderer.autoClear = false
      context.updateAllComponents()
      // _renderer.autoClear = true
      if (this.anim) {
        this.anim()
      }
      _renderer.render(_markScene, _camera)
      if (context.stats) {
        context.stats.end()
      }
      requestAnimationFrame(context.render)
    }


    context.render = this.renderPatch
  }
}
