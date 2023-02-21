import {
  Color,
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


/**
 * PlaceMark to share notes
 */
export default class PlaceMark extends EventDispatcher {
  /**
   * @param {IfcContext} context
   */
  constructor({
    context,
    hexOutlineColor = 0x0000ff,
    insetOutline = true,
    thickness = 5,
  }) {
    super()
    debug().log('PlaceMark#constructor: context: ', context)
    const _domElement = context.getDomElement()
    const _camera = context.getCamera()
    const _scene = context.getScene()
    const _raycaster = new Raycaster()
    const _pointer = new Vector2()
    let _objects = []
    const _placeMarks = []
    let _materialShader
    const _outlineColor = new Color(hexOutlineColor)
    const _thicknessUniform = {value: thickness}


    this.activated = false
    _domElement.style.touchAction = 'none' // disable touch scroll


    window.addEventListener('resize', () => {
      const elRect = _domElement.getBoundingClientRect()
      _materialShader.uniforms.resolution.value.set(elRect.width, elRect.height)
    })


    this.updatePointer = (event) => {
      const elRect = _domElement.getBoundingClientRect()
      // eslint-disable-next-line no-magic-numbers, no-mixed-operators
      _pointer.x = ((event.clientX - elRect.left) / elRect.width) * 2 - 1
      // eslint-disable-next-line no-magic-numbers, no-mixed-operators
      _pointer.y = (-(event.clientY - elRect.top) / elRect.height) * 2 + 1
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
        if (insetOutline) {
          sprite.material.defines = {INSET_OUTLINE: 1}
        }
        sprite.material.onBeforeCompile = this.onBeforeCompile
        sprite.position.copy(point)
        _scene.add(sprite)
        _placeMarks.push(sprite)
      })
    }


    this.onBeforeCompile = (shader) => {
      const elRect = _domElement.getBoundingClientRect()

      shader.uniforms.outlineColor = {value: _outlineColor}
      shader.uniforms.outlineThickness = _thicknessUniform
      shader.uniforms.resolution = {value: new Vector2(elRect.width, elRect.height)}

      shader.fragmentShader = `uniform vec3 outlineColor;\n${shader.fragmentShader}`
      shader.fragmentShader = `uniform float outlineThickness;\n${shader.fragmentShader}`
      shader.fragmentShader = `uniform vec2 resolution;\n${shader.fragmentShader}`

      shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          [
            '#ifdef USE_MAP',

            ' vec4 texelColor = mapTexelToLinear( texture2D( map, vUv ) );',

            ' texelColor = mapTexelToLinear( texelColor );',

            ' vec2 texel = vec2( 1.0 / resolution.y, 1.0 / resolution.y );',

            ' #define OFFSET_COUNT 8',
            ' vec2 offsets[OFFSET_COUNT];',
            ' offsets[0] = vec2( 0, 1 );',
            ' offsets[1] = vec2( 0, -1 );',
            ' offsets[2] = vec2( 1, 0 );',
            ' offsets[3] = vec2( -1, 0 );',
            ' offsets[4] = vec2( -1, 1 );',
            ' offsets[5] = vec2( 1, -1 );',
            ' offsets[6] = vec2( 1, 1 );',
            ' offsets[7] = vec2( -1, -1 );',

            '#ifdef INSET_OUTLINE',

            ' float a = 1.0;',
            ' for( int i = 0; i < OFFSET_COUNT; i ++ ) {',
            '  float val = texture2D( map, vUv + texel * offsets[i] * outlineThickness ).a;',
            '  a *= val;',
            ' }',

            ' texelColor.rgb = mix( outlineColor, texelColor.rgb, a );',
            '#else',

            ' float a = 0.0;',
            ' for( int i = 0; i < OFFSET_COUNT; i ++ ) {',
            '  float val = texture2D( map, vUv + texel * offsets[i] * outlineThickness ).a;',
            '  a = max(a, val);',
            ' }',
            ' texelColor = mix( vec4(outlineColor, a), texelColor, texelColor.a );',
            '#endif',

            ' diffuseColor *= texelColor;',

            '#endif',
          ].join('\n'),
      )

      _materialShader = shader
    }
  }
}
