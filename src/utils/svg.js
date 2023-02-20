import {
  Texture,
  Box3,
  Color,
  DoubleSide,
  Group,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  ShapeGeometry,
  FileLoader,
  LinearFilter,
  CircleGeometry,
} from 'three'
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader'
import {assertDefined} from './assert'
import debug from './debug'


const svgLoadingManager = new LoadingManager()
const svgLoader = new SVGLoader(svgLoadingManager)
const fileLoadingManager = new LoadingManager()
const fileLoader = new FileLoader(fileLoadingManager)


export const getSVGGroup = async ({
  url,
  width = 2,
  height = 0,
  drawStrokes = true,
  drawFillShapes = true,
  strokesWireframe = false,
  fillShapesWireframe = false,
}) => {
  const svgData = await svgLoader.loadAsync(url)
  const paths = svgData.paths
  const group = new Group()
  const svgGroup = new Group()

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    const fillColor = path.userData.style.fill
    const strokeColor = path.userData.style.stroke

    if (drawFillShapes && fillColor !== undefined && fillColor !== 'none') {
      const material = new MeshBasicMaterial({
        color: new Color().setStyle(fillColor).convertSRGBToLinear(),
        opacity: path.userData.style.fillOpacity,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
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
      const material = new MeshBasicMaterial({
        color: new Color().setStyle(strokeColor).convertSRGBToLinear(),
        opacity: path.userData.style.strokeOpacity,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
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


export const getSVGMesh = async ({
  url,
  radius = 2,
  color = 'black',
}) => {
  assertDefined(url)
  const svgData = await fileLoader.loadAsync(url)
  const parser = new DOMParser()
  const svg = parser.parseFromString(svgData, 'image/svg+xml').documentElement
  debug().log('svg#getSVGMesh: svg.width: ', svg.width)
  debug().log('svg#getSVGMesh: svg.height: ', svg.height)
  svg.setAttribute('fill', color)
  const newSvgData = (new XMLSerializer()).serializeToString(svg)
  const canvas = document.createElement('canvas')
  canvas.width = svg.width.baseVal.value
  canvas.height = svg.height.baseVal.value
  const ctx = canvas.getContext('2d')
  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    img.setAttribute('src', `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(newSvgData)))}`)
    img.onload = function() {
      ctx.drawImage(img, 0, 0)
      const texture = new Texture(canvas)
      texture.needsUpdate = true
      // eslint-disable-next-line no-magic-numbers
      const geometry = new CircleGeometry(radius, 50)
      const material = new MeshBasicMaterial({map: texture, side: DoubleSide})
      material.map.minFilter = LinearFilter
      const mesh = new Mesh(geometry, material)
      resolve(mesh)
    }
  })
}
