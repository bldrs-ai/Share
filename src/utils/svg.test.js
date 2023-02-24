import {deletePropertyRecursive, deleteStringValueMatchRecursive} from './objects'
import {UUID_REGEX} from './strings'
import {getSvgGroupFromObj, getSvgSpriteFromEl} from './svg'


const {SVGLoader} = jest.requireActual('three/examples/jsm/loaders/SVGLoader')


describe('svg', () => {
  it('getSvgGroupFromObj snapshot of PlaceMarkSvg matches', () => {
    const fs = require('fs')
    const svgBuf = fs.readFileSync('src/assets/icons/PlaceMark.svg', 'utf8')
    const svgLoader = new SVGLoader()
    const svgData = svgLoader.parse(svgBuf)
    const svgGroup = getSvgGroupFromObj({svgData})
    deletePropertyRecursive(svgGroup, 'uuid')
    deleteStringValueMatchRecursive(svgGroup, UUID_REGEX)
    expect(svgGroup).toMatchSnapshot()
  })

  it('getSvgSpriteFromEl snapshot of PlaceMarkSvg matches', () => {
    const fs = require('fs')
    const svgStr = fs.readFileSync('src/assets/icons/PlaceMark.svg', 'utf8')
    const svgSprite = getSvgSpriteFromEl({svgStr})
    deletePropertyRecursive(svgSprite, 'uuid')
    deleteStringValueMatchRecursive(svgSprite, UUID_REGEX)
    expect(svgSprite).toMatchSnapshot()
  })
})
