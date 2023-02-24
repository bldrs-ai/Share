import {deletePropertyRecursive, deleteStringValueMatchRecursive} from './objects'
import {getSvgGroup} from './svg'


const {SVGLoader} = jest.requireActual('three/examples/jsm/loaders/SVGLoader')


describe('svg', () => {
  it('getSVGGroup snapshot of PlaceMarkSvg matches', () => {
    const fs = require('fs')
    const svgBuf = fs.readFileSync('src/assets/icons/PlaceMark.svg', 'utf8')
    const svgLoader = new SVGLoader()
    const svgData = svgLoader.parse(svgBuf)
    const svgGroup = getSvgGroup({svgData})
    deletePropertyRecursive(svgGroup, 'uuid')
    deleteStringValueMatchRecursive(svgGroup, /[0-9A-Z]+-[0-9A-Z]+-[0-9A-Z]+-[0-9A-Z]+-[0-9A-Z]+/)
    expect(svgGroup).toMatchSnapshot()
  })
})
