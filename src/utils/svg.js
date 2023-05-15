import {
  FileLoader,
  Group,
  MeshBasicMaterial,
  DoubleSide,
  ShapeGeometry,
  Mesh,
  Box3,
  Texture,
  LinearFilter,
  SpriteMaterial,
  Sprite,
  ImageLoader,
  Color,
} from 'three'
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader'
import {assertDefined} from './assert'


const svgLoader = new SVGLoader()
const fileLoader = new FileLoader()
const imageLoader = new ImageLoader()


/**
 * Get svg object from url
 *
 * @param {string} svgUrl
 * @return {object}
 */
export async function getSvgObjFromUrl(svgUrl) {
  const svgObj = await svgLoader.loadAsync(svgUrl)
  return svgObj
}


/**
 * Generate group using svg file
 *
 * @param {object} svgObj
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
export function getSvgGroupFromObj({
  svgObj,
  fillColor,
  strokeColor,
  width = 0,
  height = 2,
  drawStrokes = true,
  drawFillShapes = true,
  strokesWireframe = false,
  fillShapesWireframe = false,
}) {
  const paths = svgObj.paths
  const group = new Group()
  const svgGroup = new Group()
  const tempColor = new Color()

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    if (!fillColor) {
      fillColor = path.userData.style.fill
    }
    if (!strokeColor) {
      strokeColor = path.userData.style.stroke
    }

    if (drawFillShapes && fillColor !== undefined && fillColor !== 'none') {
      const color = tempColor.setStyle(fillColor).convertSRGBToLinear()
      const material = new MeshBasicMaterial({
        color: color,
        opacity: path.userData.style.fillOpacity,
        transparent: true,
        side: DoubleSide,
        // depthWrite: false,
        wireframe: fillShapesWireframe,
      })
      const shapes = SVGLoader.createShapes(path)

      for (let j = 0; j < shapes.length; j++) {
        const shape = shapes[j]
        const geometry = new ShapeGeometry(shape)
        const mesh = new Mesh(geometry, material)
        group.add(mesh)
      }
    }

    if (drawStrokes && strokeColor !== undefined && strokeColor !== 'none') {
      const color = tempColor.setStyle(strokeColor).convertSRGBToLinear()
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
  const groupSize = groupBox3.max.sub(groupBox3.min)
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
  group.scale.x = scaleX
  group.scale.y = scaleY
  group.position.x = -width
  group.position.y = height
  group.scale.y *= - 1
  svgGroup.add(group)
  return svgGroup
}


/**
 * Get svg canvas
 *
 * @param {string} svgUrl
 * @param {string} fillColor
 * @return {object}
 */
export async function getSvgCanvas({svgUrl, fillColor}) {
  const svgStr = await fileLoader.loadAsync(svgUrl)
  const parser = new DOMParser()
  const svgEl = parser.parseFromString(svgStr, 'image/svg+xml').documentElement
  if (fillColor) {
    svgEl.setAttribute('fill', fillColor)
  }
  const newSvgData = (new XMLSerializer()).serializeToString(svgEl)
  const dataUrl = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(newSvgData)))}`
  const imageTag = await imageLoader.loadAsync(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = svgEl.width?.baseVal?.value
  canvas.height = svgEl.height?.baseVal?.value
  const ctx = canvas.getContext('2d')
  ctx.drawImage(imageTag, 0, 0)
  return canvas
}


/**
 * Generate sprite using svg file
 *
 * @param {string} svgEl
 * @param {string} fillColor color to fill sprite
 * @param {number} width
 * @param {number} height
 * @return {number} svg based sprite
 */
export function getSpriteFromSvgCanvas({
  svgCanvas,
  width = 0,
  height = 0,
}) {
  assertDefined(svgCanvas)
  if (width <= 0) {
    width = height
  }
  if (height <= 0) {
    height = width
  }
  if (width <= 0 && height <= 0) {
    width = height = 1
  }
  const texture = new Texture(svgCanvas)
  texture.needsUpdate = true
  const material = new SpriteMaterial({map: texture, side: DoubleSide})
  material.map.minFilter = LinearFilter
  const sprite = new Sprite(material)
  sprite.scale.set(width, height, 1.0)
  return sprite
}


/**
 * Generate sprite using svg file
 *
 * @param {Group} group
 * @param {object} userData color to fill sprite
 */
export function addUserDataInGroup(group, userData) {
  assertDefined(group, userData)
  group.traverse((child) => {
    if (child instanceof Mesh) {
      child.userData = {
        ...child.userData,
        ...userData,
      }
    }
  })
  group.userData = {
    ...group.userData,
    ...userData,
  }
}


/**
 * @param {Group} group
 * @param {string} color
 */
export function setGroupColor(group, color) {
  assertDefined(group, color)
  const tempColor = new Color()
  group.traverse((child) => {
    if (child instanceof Mesh) {
      child.material.color = tempColor.set(color)
    }
  })
}

/**
 * @param {Group} group
 */
export function disposeGroup(group) {
  assertDefined(group)

  group.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose()
      child.material.dispose()
    }
  })
}
