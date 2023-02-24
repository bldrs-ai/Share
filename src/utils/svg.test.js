import {deletePropertyRecursive, deleteStringValueMatchRecursive} from './objects'
import {UUID_REGEX} from './strings'
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
    deleteStringValueMatchRecursive(svgGroup, UUID_REGEX)
    expect(svgGroup).toMatchSnapshot()
  })
})
