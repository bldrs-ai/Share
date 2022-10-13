import fontJSON from '../../assets/font/droid_sans_bold.typeface.json'
import {BoxGeometry, Mesh, RingGeometry, Vector3} from 'three'
import {FontLoader} from 'three/examples/jsm/loaders/FontLoader.js'
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js'
import {Tween} from '@tweenjs/tween.js'
import {NavCubeMaterial} from './NaveCubeMaterial'


export class BoxCube {
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
    // this.floor = this.initFloor("floor", 400, 2, 400, 0, -68, 0)
    this.initRing()
  }
  initItem(name, x0, y0, z0, x1, y1, z1) {
    const geometry = new BoxGeometry(x0, y0, z0)
    geometry.translate(x1, y1, z1)
    const mesh = new Mesh(geometry, NavCubeMaterial.normalCube)
    this.scene.add(mesh)
    mesh.name = name
    return mesh
  }

  initRing() {
    const geometry = new RingGeometry(80, 130, 30)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, -60, 0)
    const mesh = new Mesh(geometry, NavCubeMaterial.ring)
    mesh.name = 'W' + 'TextCube'
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
  const font = loader.parse(fontJSON)
  const parameters = {
    font: font,
    size: 36,
    height: 2,
  }
  if (name === 'bottom') {
    var textCube = new TextGeometry('bot', parameters)
  } else {
    var textCube = new TextGeometry(name, parameters)
  }
  textCube.translate(x1, y1, z1)

  hasRotate(name, textCube)
  const meshCube = new Mesh(textCube, NavCubeMaterial.textCube)
  meshCube.name = `${name}TextCube`
  meshCube.textCube = name
  scene.add(meshCube)
}
/**
 *
 */
function initTextRing(scene, name, x1, y1, z1) {
  const loader = new FontLoader()
  const font = loader.parse(fontJSON)
  const parameters = {
    font: font,
    size: 50,
    height: 2,
  }
  const textCube = new TextGeometry(name, parameters)
  rotateRing(name, textCube)
  textCube.translate(x1, y1, z1)
  const meshCube = new Mesh(textCube, NavCubeMaterial.textRing)
  meshCube.name = `${name}TextCube`
  meshCube.textCube = name
  scene.add(meshCube)
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

/**
 *
 * because viewer set damping factor, so we don't need to use tween
 */
export function switchPick(camera0, ifcModel, name) {

  //radius of model
  const r = ifcModel.geometry.boundingSphere.radius * 2
  //center of model
  const c = ifcModel.geometry.boundingSphere.center
  const coords = new Vector3(0, 0, 0)
  switch (name) {
    case 'left':
      coords.x = c.x
      coords.y = c.y
      coords.z = r
      break
    case 'right':
      coords.x = c.x
      coords.y = c.y
      coords.z = -r
      break
    case 'top':
      // tween.to({pos: {x: 0, y: pos, z: 0}}, speedTween)
      coords.x = c.x
      coords.y = r
      coords.z = c.z
      break
    case 'bottom':
      // tween.to({pos: {x: 0, y: -pos, z: 0}}, speedTween)
      coords.x = c.x
      coords.y = -r
      coords.z = c.z
      break
    case 'front':
      // tween.to({pos: {x: pos, y: 0, z: 0}}, speedTween)
      coords.x = r
      coords.y = c.y
      coords.z = c.z
      break
    case 'back':
      // tween.to({pos: {x: -pos, y: 0, z: 0}}, speedTween)
      coords.x = -r
      coords.y = c.y
      coords.z = c.z
      break
    case 'left_front':
      // tween.to({pos: {x: pos, y: 0, z: pos}}, speedTween)
      coords.x = r
      coords.y = c.y
      coords.z = r

      break
    case 'left_back':
      // tween.to({pos: {x: -pos, y: 0, z: pos}}, speedTween)
      coords.x = -r
      coords.y = c.y
      coords.z = r
      break
    case 'right_front':
      // tween.to({pos: {x: pos, y: 0, z: -pos}}, speedTween)
      coords.x = r
      coords.y = c.y
      coords.z = -r
      break
    case 'right_back':
      // tween.to({pos: {x: -pos, y: 0, z: -pos}}, speedTween)
      coords.x = -r
      coords.y = c.y
      coords.z = -r
      break
    case 'top_left':
      // tween.to({pos: {x: 0, y: pos, z: pos}}, speedTween)
      coords.x = c.x
      coords.y = r
      coords.z = r
      break
    case 'top_right':
      // tween.to({pos: {x: 0, y: pos, z: -pos}}, speedTween)
      coords.x = c.x
      coords.y = r
      coords.z = -r
      break
    case 'top_front':
      // tween.to({pos: {x: pos, y: pos, z: 0}}, speedTween)
      coords.x = r
      coords.y = r
      coords.z = c.z
      break
    case 'top_back':
      // tween.to({pos: {x: -pos, y: pos, z: 0}}, speedTween)
      coords.x = -r
      coords.y = r
      coords.z = c.z
      break
    case 'bottom_left':
      // tween.to({pos: {x: 0, y: -pos, z: pos}}, speedTween)
      coords.x = c.x
      coords.y = -r
      coords.z = r
      break
    case 'bottom_right':
      // tween.to({pos: {x: 0, y: -pos, z: -pos}}, speedTween)
      coords.x = c.x
      coords.y = -r
      coords.z = -r
      break
    case 'bottom_front':
      // tween.to({pos: {x: pos, y: -pos, z: 0}}, speedTween)
      coords.x = r
      coords.y = -r
      coords.z = c.z
      break
    case 'bottom_back':
      // tween.to({pos: {x: -pos, y: -pos, z: 0}}, speedTween)
      coords.x = -r
      coords.y = -r
      coords.z = c.z
      break

    case 'top_left_front':
      // tween.to({pos: {x: pos, y: pos, z: pos}}, speedTween)
      coords.x = r
      coords.y = r
      coords.z = r
      break
    case 'top_left_back':
      // tween.to({pos: {x: -pos, y: pos, z: pos}}, speedTween)
      coords.x = -r
      coords.y = r
      coords.z = r
      break
    case 'top_right_front':
      // tween.to({pos: {x: pos, y: pos, z: -pos}}, speedTween)
      coords.x = r
      coords.y = r
      coords.z = -r
      break
    case 'top_right_back':
      // tween.to({pos: {x: -pos, y: pos, z: -pos}}, speedTween)
      coords.x = -r
      coords.y = r
      coords.z = -r
      break
    case 'bottom_left_front':
      // tween.to({pos: {x: pos, y: -pos, z: pos}}, speedTween)
      coords.x = r
      coords.y = -r
      coords.z = r
      break
    case 'bottom_left_back':
      // tween.to({pos: {x: -pos, y: -pos, z: pos}}, speedTween)
      coords.x = -r
      coords.y = -r
      coords.z = r
      break
    case 'bottom_right_front':
      // tween.to({pos: {x: pos, y: -pos, z: -pos}}, speedTween)
      coords.x = r
      coords.y = -r
      coords.z = -r
      break
    case 'bottom_right_back':
      // tween.to({pos: {x: -pos, y: -pos, z: -pos}}, speedTween)
      coords.x = -r
      coords.y = -r
      coords.z = -r
      break
    default:
      break
  }
  camera0.setPosition(coords.x, coords.y, coords.z, true)
  // camera0.setTarget(c.x, c.y, c.z, true)
  camera0.setLookAt(coords.x, coords.y, coords.z, c.x, c.y, c.z, true)
}
