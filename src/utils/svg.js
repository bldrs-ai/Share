import {
  FileLoader,
  Group,
  MeshBasicMaterial,
  Color,
  DoubleSide,
  ShapeGeometry,
  Mesh,
  Box3,
  Texture,
  LinearFilter,
  SpriteMaterial,
  Sprite,
} from 'three'
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader'
import {assertDefined} from './assert'
import debug from './debug'


const svgLoader = new SVGLoader()
const fileLoader = new FileLoader()


/**
 * Wrapper for svgLoader.loadAsync
 *
 * @param {string} svgUrl
 * @return {object}
 */
export async function loadSvgData(svgUrl) {
  const svgData = await svgLoader.loadAsync(svgUrl)
  return svgData
}


/**
 * Generate group using svg file
 *
 * @param {object} svgData
 * @param {string} fillColor color to fill group
 * @param {string} strokeColor color to draw strokes
 * @param {number} width
 * @param {number} height
 * @param {boolean} drawStrokes
 * @param {boolean} drawFillShapes
 * @param {boolean} strokesWireframe
 * @param {boolean} fillShapesWireframe
 * @return {number} svg based group
 */
export function getSvgGroup({
  svgData,
  fillColor,
  strokeColor,
  width = 2,
  height = 0,
  drawStrokes = true,
  drawFillShapes = true,
  strokesWireframe = false,
  fillShapesWireframe = false,
}) {
  debug().log('svg#getSVGGroup: svgData: ', svgData)
  const paths = svgData.paths
  const group = new Group()
  const svgGroup = new Group()
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    if (!fillColor) {
      fillColor = path.userData.style.fill
    }
    if (!strokeColor) {
      strokeColor = path.userData.style.stroke
    }

    if (drawFillShapes && fillColor !== undefined && fillColor !== 'none') {
      const color = new Color()
      color.setStyle(fillColor)
      color.convertSRGBToLinear()
      const material = new MeshBasicMaterial({
        color: color,
        opacity: path.userData.style.fillOpacity,
        transparent: true,
        side: DoubleSide,
        // depthWrite: false,
        wireframe: fillShapesWireframe,
      })
      const shapes = SVGLoader.createShapes(path)
      debug().log('svg#getSVGGroup: shapes: ', shapes)

      for (let j = 0; j < shapes.length; j++) {
        const shape = shapes[j]
        const geometry = new ShapeGeometry(shape)
        const mesh = new Mesh(geometry, material)
        group.add(mesh)
      }
    }

    if (drawStrokes && strokeColor !== undefined && strokeColor !== 'none') {
      const color = new Color()
      color.setStyle(strokeColor)
      color.convertSRGBToLinear()
      const material = new MeshBasicMaterial({
        color: color,
        opacity: path.userData.style.strokeOpacity,
        transparent: true,
        side: DoubleSide,
        // depthWrite: false,
        wireframe: strokesWireframe,
      })

      for (let j = 0, jl = path.subPaths.length; j < jl; j++) {
        const subPath = path.subPaths[j]
        const geometry = SVGLoader.pointsToStroke(subPath.getPoints(), path.userData.style)

        if (geometry) {
          const mesh = new Mesh(geometry, material)
          group.add(mesh)
        }
      }
    }
  }

  const groupBox3 = new Box3()
  groupBox3.setFromObject(group)
  debug().log('svg#getSVGGroup: groupBox3: ', groupBox3)
  const groupSize = groupBox3.max.sub(groupBox3.min)
  debug().log('svg#getSVGGroup: groupSize: ', groupSize)
  let scaleX = 0
  let scaleY = 0
  if (width) {
    scaleX = width / groupSize.x
  }
  if (height) {
    scaleY = height / groupSize.y
  }
  if (!width) {
    scaleX = scaleY
  }
  if (!height) {
    scaleY = scaleX
  }
  if (!width && !height) {
    scaleX = scaleY = 1
  }
  if (!width) {
    width = scaleX * groupSize.x
  }
  if (!height) {
    height = scaleY * groupSize.y
  }
  debug().log('svg#getSVGGroup: group scales: ', scaleX, scaleY, width, height)
  group.scale.x = scaleX
  group.scale.y = scaleY
  group.position.x = -width
  group.position.y = height
  group.scale.y *= - 1
  svgGroup.add(group)
  return svgGroup
}


/**
 * Wrapper for fileLoader.loadAsync
 *
 * @param {string} svgUrl
 * @return {string}
 */
export async function loadSvgStr(svgUrl) {
  const svgStr = await fileLoader.loadAsync(svgUrl)
  return svgStr
}


/**
 * Generate sprite using svg file
 *
 * @param {string} svgStr
 * @param {string} fillColor color to fill sprite
 * @param {number} width
 * @param {number} height
 * @return {number} svg based sprite
 */
export async function getSvgSprite({
  svgStr,
  fillColor,
  width = 0,
  height = 0,
}) {
  assertDefined(svgStr)
  if (width <= 0) {
    width = height
  }
  if (height <= 0) {
    height = width
  }
  if (width <= 0 && height <= 0) {
    width = height = 1
  }
  debug().log('svg#getSvgSprite: svgStr: ', svgStr)
  const parser = new DOMParser()
  const svg = parser.parseFromString(svgStr, 'image/svg+xml').documentElement
  debug().log('svg#getSvgSprite: svg.width: ', svg.width)
  debug().log('svg#getSvgSprite: svg.height: ', svg.height)
  if (fillColor) {
    svg.setAttribute('fill', fillColor)
  }
  const newSvgData = (new XMLSerializer()).serializeToString(svg)
  const canvas = document.createElement('canvas')
  canvas.width = svg.width.baseVal.value
  canvas.height = svg.height.baseVal.value
  const ctx = canvas.getContext('2d')
  return await new Promise((resolve, reject) => {
    const image = new Image()
    const dataUrl = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(newSvgData)))}`
    image.src = dataUrl
    debug().log('svg#getSvgSprite: dataUrl: ', dataUrl)
    image.onload = function() {
      ctx.drawImage(image, 0, 0)
      const texture = new Texture(canvas)
      texture.needsUpdate = true
      const material = new SpriteMaterial({map: texture, side: DoubleSide})
      material.map.minFilter = LinearFilter
      const sprite = new Sprite(material)
      sprite.scale.set(width, height, 1.0)
      resolve(sprite)
    }
  })
}
