/* eslint-disable no-magic-numbers */
import fontJSON from '../../assets/font/droid_sans_bold.typeface.json'
import {BoxGeometry, EdgesGeometry, LineSegments, Mesh, Vector3} from 'three'
import {FontLoader} from 'three/examples/jsm/loaders/FontLoader.js'
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js'
import {NavCubeMaterial} from './NavCubeMaterial'

/**
 *Box Cube class
 */
export class BoxCube {
  /**
   *Box Cube constructor
   */
  constructor(scene) {
    this.scene = scene
    const testPosition = [-50, -10, 64]
    this.left = this.initItem('left', 96, 96, 16, 0, 0, 56)
    initText3D(this.scene, 'bldrs', -34, testPosition[1], testPosition[2])
    this.right = this.initItem('right', 96, 96, 16, 0, 0, -56)
    initText3D(this.scene, 'right', testPosition[0], testPosition[1], testPosition[2])

    this.top = this.initItem('top', 96, 16, 96, 0, 56, 0)
    initText3D(this.scene, 'top', -40, testPosition[1], testPosition[2])

    this.bottom = this.initItem('bottom', 96, 16, 96, 0, -56, 0)
    initText3D(this.scene, 'bottom', -40, testPosition[1], testPosition[2])

    this.front = this.initItem('front', 16, 96, 96, 56, 0, 0)
    initText3D(this.scene, 'front', testPosition[0], testPosition[1], testPosition[2])
    this.back = this.initItem('back', 16, 96, 96, -56, 0, 0)
    initText3D(this.scene, 'back', testPosition[0], testPosition[1], testPosition[2])

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
    this.initOutLine()
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
    // const edges = new EdgesGeometry(geometry);
    // const line = new LineSegments(edges, NavCubeMaterial.outLine);
    // mesh.add(line);
    mesh.userData.Element = true
    mesh.userData.onScale = (scale) => {
      mesh.scale.set(scale, scale, scale)
    }
    return mesh
  }

  /**
   * Box outline
   *
   */
  initOutLine() {
    const geometry = new BoxGeometry(128, 128, 128)
    const edges = new EdgesGeometry(geometry)
    const outLine = new LineSegments(edges, NavCubeMaterial.outLine)
    outLine.textCube = 'OutLine'
    outLine.userData.OutLine = true
    outLine.userData.onScale = (scale) => {
      outLine.scale.set(scale, scale, scale)
    }
    this.scene.add(outLine)
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
    size: 20,
    height: 4,
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
      coords.z = r + c.z
      break
    case 'right':
      coords.x = c.x
      coords.y = c.y
      coords.z = -r + c.z
      break
    case 'top':
      // tween.to({pos: {x: zero, y: pos, z: zero}}, speedTween)
      coords.x = c.x
      coords.y = r + c.y
      coords.z = c.z
      break
    case 'bottom':
      // tween.to({pos: {x: zero, y: -pos, z: zero}}, speedTween)
      coords.x = c.x
      coords.y = -r + c.y
      coords.z = c.z
      break
    case 'front':
      // tween.to({pos: {x: pos, y: zero, z: zero}}, speedTween)
      coords.x = r + c.x
      coords.y = c.y
      coords.z = c.z
      break
    case 'back':
      // tween.to({pos: {x: -pos, y: zero, z: zero}}, speedTween)
      coords.x = -r + c.x
      coords.y = c.y
      coords.z = c.z
      break
    case 'left_front':
      // tween.to({pos: {x: pos, y: zero, z: pos}}, speedTween)
      coords.x = r + c.x
      coords.y = c.y
      coords.z = r + c.z

      break
    case 'left_back':
      // tween.to({pos: {x: -pos, y: zero, z: pos}}, speedTween)
      coords.x = -r + c.x
      coords.y = c.y
      coords.z = r + c.z
      break
    case 'right_front':
      // tween.to({pos: {x: pos, y: zero, z: -pos}}, speedTween)
      coords.x = r + c.x
      coords.y = c.y
      coords.z = -r + c.z
      break
    case 'right_back':
      // tween.to({pos: {x: -pos, y: zero, z: -pos}}, speedTween)
      coords.x = -r + c.x
      coords.y = c.y
      coords.z = -r + c.z
      break
    case 'top_left':
      // tween.to({pos: {x: zero, y: pos, z: pos}}, speedTween)
      coords.x = c.x
      coords.y = r + c.y
      coords.z = r + c.z
      break
    case 'top_right':
      // tween.to({pos: {x: zero, y: pos, z: -pos}}, speedTween)
      coords.x = c.x
      coords.y = r + c.y
      coords.z = -r + c.z
      break
    case 'top_front':
      // tween.to({pos: {x: pos, y: pos, z: zero}}, speedTween)
      coords.x = r + c.x
      coords.y = r + c.y
      coords.z = c.z
      break
    case 'top_back':
      // tween.to({pos: {x: -pos, y: pos, z: zero}}, speedTween)
      coords.x = -r + c.x
      coords.y = r + c.y
      coords.z = c.z
      break
    case 'bottom_left':
      // tween.to({pos: {x: zero, y: -pos, z: pos}}, speedTween)
      coords.x = c.x
      coords.y = -r + c.y
      coords.z = r + c.z
      break
    case 'bottom_right':
      // tween.to({pos: {x: zero, y: -pos, z: -pos}}, speedTween)
      coords.x = c.x
      coords.y = -r + c.y
      coords.z = -r + c.z
      break
    case 'bottom_front':
      // tween.to({pos: {x: pos, y: -pos, z: zero}}, speedTween)
      coords.x = r + c.x
      coords.y = -r + c.y
      coords.z = c.z
      break
    case 'bottom_back':
      // tween.to({pos: {x: -pos, y: -pos, z: zero}}, speedTween)
      coords.x = -r + c.x
      coords.y = -r + c.y
      coords.z = c.z
      break

    case 'top_left_front':
      // tween.to({pos: {x: pos, y: pos, z: pos}}, speedTween)
      coords.x = r + c.x
      coords.y = r + c.y
      coords.z = r + c.z
      break
    case 'top_left_back':
      // tween.to({pos: {x: -pos, y: pos, z: pos}}, speedTween)
      coords.x = -r + c.x
      coords.y = r + c.y
      coords.z = r + c.z
      break
    case 'top_right_front':
      // tween.to({pos: {x: pos, y: pos, z: -pos}}, speedTween)
      coords.x = r + c.x
      coords.y = r + c.y
      coords.z = -r + c.z
      break
    case 'top_right_back':
      // tween.to({pos: {x: -pos, y: pos, z: -pos}}, speedTween)
      coords.x = -r + c.x
      coords.y = r + c.y
      coords.z = -r + c.z
      break
    case 'bottom_left_front':
      // tween.to({pos: {x: pos, y: -pos, z: pos}}, speedTween)
      coords.x = r + c.x
      coords.y = -r + c.y
      coords.z = r + c.z
      break
    case 'bottom_left_back':
      // tween.to({pos: {x: -pos, y: -pos, z: pos}}, speedTween)
      coords.x = -r + c.x
      coords.y = -r + c.y
      coords.z = r + c.z
      break
    case 'bottom_right_front':
      // tween.to({pos: {x: pos, y: -pos, z: -pos}}, speedTween)
      coords.x = r + c.x
      coords.y = -r + c.y
      coords.z = -r + c.z
      break
    case 'bottom_right_back':
      // tween.to({pos: {x: -pos, y: -pos, z: -pos}}, speedTween)
      coords.x = -r + c.x
      coords.y = -r + c.y
      coords.z = -r + c.z
      break
    default:
      break
  }
  camera0.setPosition(coords.x, coords.y, coords.z, true)
  camera0.setLookAt(coords.x, coords.y, coords.z, c.x, c.y, c.z, true)
}
