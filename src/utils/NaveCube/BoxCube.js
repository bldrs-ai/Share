import fontJSON from '../../assets/font/droid_sans_bold.typeface.json'
import {BoxGeometry, Mesh, RingGeometry, Vector3} from 'three'
import {FontLoader} from 'three/examples/jsm/loaders/FontLoader.js'
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js'
import {NavCubeMaterial} from './NaveCubeMaterial'


/**
 *Box Cube class
 */
export class BoxCube {
  /**
   *Box Cube constructor
   */
  constructor(scene) {
    this.scene = scene
    const zero = 0
    const nineSix = 96
    const oneSix = 16
    const negativeOneSix = -16
    const fiveSix = 56
    const negativeFiveSix = -56
    const negativeFourSix = -46
    const negativeOneEight = -18
    const sixFour = 64
    const negativeFiveEight = -58
    const negativeThreeTwo = -32
    const negativeFiveSeven = -57
    const negativeSevenFive = -75
    const sevenFive = 75
    const twoZero = 20

    this.left = this.initItem('left', nineSix, nineSix, oneSix, zero, zero, fiveSix)
    initText3D(this.scene, 'left', negativeFourSix, negativeOneEight, sixFour)
    this.right = this.initItem('right', nineSix, nineSix, oneSix, zero, zero, negativeFiveSix)
    initText3D(this.scene, 'right', negativeFiveSix, negativeOneEight, sixFour)

    this.top = this.initItem('top', nineSix, oneSix, nineSix, zero, fiveSix, zero)
    initText3D(this.scene, 'top', negativeFourSix, negativeOneEight, sixFour)

    this.bottom = this.initItem('bottom', nineSix, oneSix, nineSix, zero, negativeFiveSix, zero)
    initText3D(this.scene, 'bottom', negativeFourSix, negativeOneEight, sixFour)

    this.front = this.initItem('front', oneSix, nineSix, nineSix, fiveSix, zero, zero)
    initText3D(this.scene, 'front', negativeFiveEight, negativeOneEight, sixFour)
    this.back = this.initItem('back', oneSix, nineSix, nineSix, negativeFiveSix, zero, zero)
    initText3D(this.scene, 'back', negativeFiveEight, negativeOneEight, sixFour)

    initTextRing(this.scene, 'W', negativeThreeTwo, negativeFiveSeven, sevenFive)
    initTextRing(this.scene, 'E', negativeOneSix, negativeFiveSeven, negativeSevenFive)
    initTextRing(this.scene, 'N', negativeSevenFive, negativeFiveSeven, twoZero)
    initTextRing(this.scene, 'S', sevenFive, negativeFiveSeven, twoZero)

    this.left_front = this.initItem('left_front', oneSix, nineSix, oneSix, fiveSix, zero, fiveSix)
    this.left_back = this.initItem('left_back', oneSix, nineSix, oneSix, -negativeFiveSix, zero, fiveSix)
    this.right_front = this.initItem('right_front', oneSix, nineSix, oneSix, fiveSix, zero, negativeFiveSix)
    this.right_back = this.initItem('right_back', oneSix, nineSix, oneSix, negativeFiveSix, zero, negativeFiveSix)

    this.top_left = this.initItem('top_left', nineSix, oneSix, oneSix, zero, fiveSix, fiveSix)
    this.top_right = this.initItem('top_right', nineSix, oneSix, oneSix, zero, fiveSix, negativeFiveSix)
    this.top_front = this.initItem('top_front', oneSix, oneSix, nineSix, fiveSix, fiveSix, zero)
    this.top_back = this.initItem('top_back', oneSix, oneSix, nineSix, negativeFiveSix, fiveSix, zero)

    this.bottom_left = this.initItem('bottom_left', nineSix, oneSix, oneSix, zero, negativeFiveSix, fiveSix)
    this.bottom_right = this.initItem('bottom_right', nineSix, oneSix, oneSix, zero, negativeFiveSix, negativeFiveSix)
    this.bottom_front = this.initItem('bottom_front', oneSix, oneSix, nineSix, fiveSix, negativeFiveSix, zero)
    this.bottom_back = this.initItem('bottom_back', oneSix, oneSix, nineSix, negativeFiveSix, negativeFiveSix, zero)

    this.top_left_front = this.initItem('top_left_front', oneSix, oneSix, oneSix, fiveSix, fiveSix, fiveSix)
    this.top_left_back = this.initItem('top_left_back', oneSix, oneSix, oneSix, negativeFiveSix, fiveSix, fiveSix)
    this.top_right_front = this.initItem('top_right_front', oneSix, oneSix, oneSix, fiveSix, fiveSix, negativeFiveSix)
    this.top_right_back = this.initItem('top_right_back', oneSix, oneSix, oneSix, negativeFiveSix, fiveSix, negativeFiveSix)

    this.bottom_left_front = this.initItem('bottom_left_front', oneSix, oneSix, oneSix, fiveSix, negativeFiveSix, fiveSix)
    this.bottom_left_back = this.initItem('bottom_left_back', oneSix, oneSix, oneSix, negativeFiveSix, negativeFiveSix, fiveSix)
    this.bottom_right_front = this.initItem('bottom_right_front', oneSix, oneSix, oneSix, fiveSix, negativeFiveSix, negativeFiveSix)
    this.bottom_right_back = this.initItem('bottom_right_back', oneSix, oneSix, oneSix, negativeFiveSix, negativeFiveSix, negativeFiveSix)
    // this.floor = this.initFloor("floor", 400, 2, 400, zero, -68, zero)
    this.initRing()
  }

  /**
   * Box Cube Item
   *
   * @return {object} mesh
   */
  initItem(name, x0, y0, z0, x1, y1, z1) {
    const geometry = new BoxGeometry(x0, y0, z0)
    geometry.translate(x1, y1, z1)
    const mesh = new Mesh(geometry, NavCubeMaterial.normalCube)
    this.scene.add(mesh)
    mesh.name = name
    return mesh
  }

  /**
   * Box Cube Ring
   *
   * @return {object} mesh
   */
  initRing() {
    const zero = 0
    const two = 2
    /* eslint-disable no-magic-numbers */
    const geometry = new RingGeometry(80, 130, 30)
    geometry.rotateX(-Math.PI / two)
    geometry.translate(zero, -60, zero)
    const mesh = new Mesh(geometry, NavCubeMaterial.ring)
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
  const font = loader.parse(fontJSON)
  let textCube
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
  const two = 2
  switch (name) {
    case 'W':
      textCube.rotateX(Math.PI / two)
      break
    case 'E':
      textCube.rotateX(-Math.PI / two)
      break
    case 'S':
      textCube.rotateY(Math.PI / two)
      textCube.rotateZ(-Math.PI / two)
      break
    case 'N':
      textCube.rotateY(Math.PI / two)
      textCube.rotateZ(Math.PI / two)
      break
    default:
      break
  }
}
/**
 *
 */
function hasRotate(name, textCube) {
  const two = 2
  switch (name) {
    case 'left':
      break
    case 'right':
      textCube.rotateY(Math.PI)
      break
    case 'top':
      textCube.rotateY(Math.PI / two)
      textCube.rotateZ(Math.PI / two)
      break
    case 'bottom':
      textCube.rotateX(Math.PI / two)
      break
    case 'front':
      textCube.rotateY(Math.PI / two)
      break
    case 'back':
      textCube.rotateY(-Math.PI / two)
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
  // radius of model
  const two = 2
  const zero = 0
  const r = ifcModel.geometry.boundingSphere.radius * two
  // center of model
  const c = ifcModel.geometry.boundingSphere.center
  const coords = new Vector3(zero, zero, zero)
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
      // tween.to({pos: {x: zero, y: pos, z: zero}}, speedTween)
      coords.x = c.x
      coords.y = r
      coords.z = c.z
      break
    case 'bottom':
      // tween.to({pos: {x: zero, y: -pos, z: zero}}, speedTween)
      coords.x = c.x
      coords.y = -r
      coords.z = c.z
      break
    case 'front':
      // tween.to({pos: {x: pos, y: zero, z: zero}}, speedTween)
      coords.x = r
      coords.y = c.y
      coords.z = c.z
      break
    case 'back':
      // tween.to({pos: {x: -pos, y: zero, z: zero}}, speedTween)
      coords.x = -r
      coords.y = c.y
      coords.z = c.z
      break
    case 'left_front':
      // tween.to({pos: {x: pos, y: zero, z: pos}}, speedTween)
      coords.x = r
      coords.y = c.y
      coords.z = r

      break
    case 'left_back':
      // tween.to({pos: {x: -pos, y: zero, z: pos}}, speedTween)
      coords.x = -r
      coords.y = c.y
      coords.z = r
      break
    case 'right_front':
      // tween.to({pos: {x: pos, y: zero, z: -pos}}, speedTween)
      coords.x = r
      coords.y = c.y
      coords.z = -r
      break
    case 'right_back':
      // tween.to({pos: {x: -pos, y: zero, z: -pos}}, speedTween)
      coords.x = -r
      coords.y = c.y
      coords.z = -r
      break
    case 'top_left':
      // tween.to({pos: {x: zero, y: pos, z: pos}}, speedTween)
      coords.x = c.x
      coords.y = r
      coords.z = r
      break
    case 'top_right':
      // tween.to({pos: {x: zero, y: pos, z: -pos}}, speedTween)
      coords.x = c.x
      coords.y = r
      coords.z = -r
      break
    case 'top_front':
      // tween.to({pos: {x: pos, y: pos, z: zero}}, speedTween)
      coords.x = r
      coords.y = r
      coords.z = c.z
      break
    case 'top_back':
      // tween.to({pos: {x: -pos, y: pos, z: zero}}, speedTween)
      coords.x = -r
      coords.y = r
      coords.z = c.z
      break
    case 'bottom_left':
      // tween.to({pos: {x: zero, y: -pos, z: pos}}, speedTween)
      coords.x = c.x
      coords.y = -r
      coords.z = r
      break
    case 'bottom_right':
      // tween.to({pos: {x: zero, y: -pos, z: -pos}}, speedTween)
      coords.x = c.x
      coords.y = -r
      coords.z = -r
      break
    case 'bottom_front':
      // tween.to({pos: {x: pos, y: -pos, z: zero}}, speedTween)
      coords.x = r
      coords.y = -r
      coords.z = c.z
      break
    case 'bottom_back':
      // tween.to({pos: {x: -pos, y: -pos, z: zero}}, speedTween)
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
