import fontJSON from '../../assets/font/droid_sans_bold.typeface.json'
import {BoxGeometry, Mesh, RingGeometry, Vector3} from 'three'
import {FontLoader} from 'three/examples/jsm/loaders/FontLoader.js'
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js'
import {Tween} from '@tweenjs/tween.js'
import {CubeControlMaterial} from '../material/CubeControlMaterial'

/* eslint-disable no-magic-numbers, no-unused-vars */

/**
 * BoxCube class
 *
 */
export class BoxCube {
/**
 * BoxCube class constructor
 *
 */
  constructor(scene) {
    this.scene = scene
    this.left = this.initItem('left', 96, 96, 16, 0, 0, 56)
    initText3D(this.scene, 'left', -46, -18, 64)
    this.right = this.initItem('right', 96, 96, 16, 0, 0, -56)
    initText3D(this.scene, 'right', -56, -18, 64)

    this.top = this.initItem('top', 96, 16, 96, 0, 56, 0)
    initText3D(this.scene, 'top', -46, -18, 64)

    this.bottom = this.initItem('bottom', 96, 16, 96, 0, -56, 0)
    initText3D(this.scene, 'bottom', -46, -18, 64)

    this.front = this.initItem('front', 16, 96, 96, 56, 0, 0)
    initText3D(this.scene, 'front', -58, -18, 64)
    this.back = this.initItem('back', 16, 96, 96, -56, 0, 0)
    initText3D(this.scene, 'back', -58, -18, 64)

    initTextRing(this.scene, 'W', -32, -57, 75)
    initTextRing(this.scene, 'E', -16, -57, -75)
    initTextRing(this.scene, 'N', -75, -57, 20)
    initTextRing(this.scene, 'S', 75, -57, 20)

    this.left_front = this.initItem('left_front', 16, 96, 16, 56, 0, 56)
    this.left_back = this.initItem('left_back', 16, 96, 16, -56, 0, 56)
    this.right_front = this.initItem('right_front', 16, 96, 16, 56, 0, -56)
    this.right_back = this.initItem('right_back', 16, 96, 16, -56, 0, -56)

    this.top_left = this.initItem('top_left', 96, 16, 16, 0, 56, 56)
    this.top_right = this.initItem('top_right', 96, 16, 16, 0, 56, -56)
    this.top_front = this.initItem('top_front', 16, 16, 96, 56, 56, 0)
    this.top_back = this.initItem('top_back', 16, 16, 96, -56, 56, 0)

    this.bottom_left = this.initItem('bottom_left', 96, 16, 16, 0, -56, 56)
    this.bottom_right = this.initItem('bottom_right', 96, 16, 16, 0, -56, -56)
    this.bottom_front = this.initItem('bottom_front', 16, 16, 96, 56, -56, 0)
    this.bottom_back = this.initItem('bottom_back', 16, 16, 96, -56, -56, 0)

    this.top_left_front = this.initItem('top_left_front', 16, 16, 16, 56, 56, 56)
    this.top_left_back = this.initItem('top_left_back', 16, 16, 16, -56, 56, 56)
    this.top_right_front = this.initItem('top_right_front', 16, 16, 16, 56, 56, -56)
    this.top_right_back = this.initItem('top_right_back', 16, 16, 16, -56, 56, -56)

    this.bottom_left_front = this.initItem('bottom_left_front', 16, 16, 16, 56, -56, 56)
    this.bottom_left_back = this.initItem('bottom_left_back', 16, 16, 16, -56, -56, 56)
    this.bottom_right_front = this.initItem('bottom_right_front', 16, 16, 16, 56, -56, -56)
    this.bottom_right_back = this.initItem('bottom_right_back', 16, 16, 16, -56, -56, -56)
    // this.floor = this.initFloor('floor', 400, 2, 400, 0, -68, 0)
    this.initRing()
  }


  /**
   * BoxCube class constructor
   *
   * @return
   */
  initItem(name, x0, y0, z0, x1, y1, z1) {
    const geometry = new BoxGeometry(x0, y0, z0)
    geometry.translate(x1, y1, z1)
    const mesh = new Mesh(geometry, CubeControlMaterial.normalCube)
    this.scene.add(mesh)
    mesh.name = name
    return mesh
  }


  /**
   * BoxCube class constructor
   *
   * @return
   */
  initRing() {
    const geometry = new RingGeometry(80, 130, 30)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, -60, 0)
    const mesh = new Mesh(geometry, CubeControlMaterial.ring)
    mesh.name = 'W TextCube'
    mesh.textCube = 'W'
    this.scene.add(mesh)
    return mesh
  }
}


/**
 *
 */
function initText3D(scene, name, x1, y1, z1) {
  const loader = new FontLoader()
  let textCube
  const fontLoader = loader.load(fontJSON, (font) => {
    const parameters = {
      font: font,
      size: 36,
      height: 2,
    }
    if (name === 'bottom') {
      textCube = new TextGeometry('bot', parameters)
    } else {
      textCube = new TextGeometry(name, parameters)
    }
    textCube.translate(x1, y1, z1)
    hasRotate(name, textCube)
    const meshCube = new Mesh(textCube, CubeControlMaterial.textCube)
    meshCube.name = `${name }TextCube`
    meshCube.textCube = name
    scene.add(meshCube)
  })
}


/**
 *
 */
function initTextRing(scene, name, x1, y1, z1) {
  const loader = new FontLoader()
  const fontLoader = loader.load(fontJSON, (font) => {
    const parameters = {
      font: font,
      size: 50,
      height: 2,
    }
    const textCube = new TextGeometry(name, parameters)
    rotateRing(name, textCube)
    textCube.translate(x1, y1, z1)
    const meshCube = new Mesh(textCube, CubeControlMaterial.textRing)
    meshCube.name = `${name }TextCube`
    meshCube.textCube = name
    scene.add(meshCube)
  })
}


/**
 *
 */
function rotateRing(name, textCube) {
  switch (name) {
    case 'W':
      textCube.rotateX(Math.PI / 2)
      break
    case 'E':
      textCube.rotateX(-Math.PI / 2)
      break
    case 'S':
      textCube.rotateY(Math.PI / 2)
      textCube.rotateZ(-Math.PI / 2)
      break
    case 'N':
      textCube.rotateY(Math.PI / 2)
      textCube.rotateZ(Math.PI / 2)
      break
    default:
      break
  }
}


/**
 *
 */
function hasRotate(name, textCube) {
  switch (name) {
    case 'left':
      break
    case 'right':
      textCube.rotateY(Math.PI)
      break
    case 'top':
      textCube.rotateY(Math.PI / 2)
      textCube.rotateZ(Math.PI / 2)
      break
    case 'bottom':
      textCube.rotateX(Math.PI / 2)
      break
    case 'front':
      textCube.rotateY(Math.PI / 2)
      break
    case 'back':
      textCube.rotateY(-Math.PI / 2)
      break
    default:
      break
  }
}
const speedTween = 500

/**
 *
 */
export function switchPick(camera0, controls0, name) {
  const x = camera0.position.x
  const y = camera0.position.y
  const z = camera0.position.z
  const rX = camera0.rotation.x
  const rY = camera0.rotation.y
  const rZ = camera0.rotation.z
  // const tween = new Tween({ pos: { x: x, y: y, z: z }, rot: { rX: rX, rY: rY, rZ: rZ } })
  const tween = new Tween({pos: {x: x, y: y, z: z}})
  const pos = camera0.userData.pos
  switch (name) {
    case 'left':
      // camera0.position.x = 0
      // camera0.position.y = 0
      // camera0.position.z = 1000
      tween.to({pos: {x: 0, y: 0, z: pos}}, speedTween)

      break
    case 'right':
      // camera0.position.x = 0
      // camera0.position.y = 0
      // camera0.position.z = -1000
      tween.to({pos: {x: 0, y: 0, z: -pos}}, speedTween)
      break
    case 'top':
      // camera0.position.x = 0
      // camera0.position.y = 1000
      // camera0.position.z = 0
      tween.to({pos: {x: 0, y: pos, z: 0}}, speedTween)

      break
    case 'bottom':
      // camera0.position.x = 0
      // camera0.position.y = -1000
      // camera0.position.z = 0
      tween.to({pos: {x: 0, y: -pos, z: 0}}, speedTween)
      break
    case 'front':
      // camera0.position.x = 1000
      // camera0.position.y = 0
      // camera0.position.z = 0
      tween.to({pos: {x: pos, y: 0, z: 0}}, speedTween)
      break
    case 'back':
      // camera0.position.x = -1000
      // camera0.position.y = 0
      // camera0.position.z = 0
      tween.to({pos: {x: -pos, y: 0, z: 0}}, speedTween)

      break
    case 'left_front':
      // camera0.position.x = 1000
      // camera0.position.y = 0
      // camera0.position.z = 1000
      tween.to({pos: {x: pos, y: 0, z: pos}}, speedTween)

      break
    case 'left_back':
      // camera0.position.x = -1000
      // camera0.position.y = 0
      // camera0.position.z = 1000
      tween.to({pos: {x: -pos, y: 0, z: pos}}, speedTween)

      break
    case 'right_front':
      // camera0.position.x = 1000
      // camera0.position.y = 0
      // camera0.position.z = -1000
      tween.to({pos: {x: pos, y: 0, z: -pos}}, speedTween)

      break
    case 'right_back':
      // camera0.position.x = -1000
      // camera0.position.y = 0
      // camera0.position.z = -1000
      tween.to({pos: {x: -pos, y: 0, z: -pos}}, speedTween)

      break
    case 'top_left':
      // camera0.position.x = 0
      // camera0.position.y = 1000
      // camera0.position.z = 1000
      tween.to({pos: {x: 0, y: pos, z: pos}}, speedTween)

      break
    case 'top_right':
      // camera0.position.x = 0
      // camera0.position.y = 1000
      // camera0.position.z = -1000
      tween.to({pos: {x: 0, y: pos, z: -pos}}, speedTween)

      break
    case 'top_front':
      // camera0.position.x = 1000
      // camera0.position.y = 1000
      // camera0.position.z = 0
      tween.to({pos: {x: pos, y: pos, z: 0}}, speedTween)

      break
    case 'top_back':
      // camera0.position.x = -1000
      // camera0.position.y = 1000
      // camera0.position.z = 0
      tween.to({pos: {x: -pos, y: pos, z: 0}}, speedTween)

      break
    case 'bottom_left':
      // camera0.position.x = 0
      // camera0.position.y = -1000
      // camera0.position.z = 1000
      tween.to({pos: {x: 0, y: -pos, z: pos}}, speedTween)

      break
    case 'bottom_right':
      // camera0.position.x = 0
      // camera0.position.y = -1000
      // camera0.position.z = -1000
      tween.to({pos: {x: 0, y: -pos, z: -pos}}, speedTween)

      break
    case 'bottom_front':
      // camera0.position.x = 1000
      // camera0.position.y = -1000
      // camera0.position.z = 0
      tween.to({pos: {x: pos, y: -pos, z: 0}}, speedTween)

      break
    case 'bottom_back':
      // camera0.position.x = -1000
      // camera0.position.y = -1000
      // camera0.position.z = 0
      tween.to({pos: {x: -pos, y: -pos, z: 0}}, speedTween)

      break

    case 'top_left_front':
      // camera0.position.x = 1000
      // camera0.position.y = 1000
      // camera0.position.z = 1000
      tween.to({pos: {x: pos, y: pos, z: pos}}, speedTween)

      break
    case 'top_left_back':
      // camera0.position.x = -1000
      // camera0.position.y = 1000
      // camera0.position.z = 1000
      tween.to({pos: {x: -pos, y: pos, z: pos}}, speedTween)

      break
    case 'top_right_front':
      camera0.position.x = pos
      // camera0.position.y = 1000
      // camera0.position.z = -1000
      tween.to({pos: {x: pos, y: pos, z: -pos}}, speedTween)

      break
    case 'top_right_back':
      // camera0.position.x = -1000
      // camera0.position.y = 1000
      // camera0.position.z = -1000
      tween.to({pos: {x: -pos, y: pos, z: -pos}}, speedTween)

      break
    case 'bottom_left_front':
      // camera0.position.x = 1000
      // camera0.position.y = -1000
      // camera0.position.z = 1000
      tween.to({pos: {x: pos, y: -pos, z: pos}}, speedTween)

      break
    case 'bottom_left_back':
      // camera0.position.x = -1000
      // camera0.position.y = -1000
      // camera0.position.z = 1000
      tween.to({pos: {x: -pos, y: -pos, z: pos}}, speedTween)

      break
    case 'bottom_right_front':
      // camera0.position.x = 1000
      // camera0.position.y = -1000
      // camera0.position.z = -1000
      tween.to({pos: {x: pos, y: -pos, z: -pos}}, speedTween)

      break
    case 'bottom_right_back':
      // camera0.position.x = -1000
      // camera0.position.y = -1000
      // camera0.position.z = -1000
      tween.to({pos: {x: -pos, y: -pos, z: -pos}}, speedTween)

      break
    default:
      break
  }
  tween.onUpdate((coords) => {
    camera0.position.x = coords.pos.x
    camera0.position.y = coords.pos.y
    camera0.position.z = coords.pos.z
  })
  camera0.lookAt(0, 0, 0)
  controls0.target = new Vector3(0, 0, 0)
  tween.start()
}
