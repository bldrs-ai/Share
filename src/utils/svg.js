import {DoubleSide, Group, LoadingManager, Mesh, MeshBasicMaterial, ShapeGeometry} from 'three'
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader'


const svgLoadingManager = new LoadingManager()
const svgLoader = new SVGLoader(svgLoadingManager)


export const getSVGGroup = async (url) => {
  const svgData = await svgLoader.loadAsync(url)
  const paths = svgData.paths
  const group = new Group()

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]

    const material = new MeshBasicMaterial({
      color: path.color,
      side: DoubleSide,
      depthWrite: false,
    })

    const shapes = SVGLoader.createShapes(path)

    for (let j = 0; j < shapes.length; j++) {
      const shape = shapes[j]
      const geometry = new ShapeGeometry(shape)
      const mesh = new Mesh(geometry, material)
      group.add(mesh)
    }
  }

  return group
}
