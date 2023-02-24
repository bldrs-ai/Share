import {deletePropertyRecursive, deleteStringValueMatchRecursive} from './objects'
import {UUID_REGEX} from './strings'
import {getSvgElFromStr, getSvgGroupFromObj, getSvgSpriteFromEl} from './svg'


const {SVGLoader} = jest.requireActual('three/examples/jsm/loaders/SVGLoader')


describe('svg', () => {
  it('getSvgGroupFromObj snapshot of PlaceMarkSvg matches', () => {
    const fs = require('fs')
    const svgBuf = fs.readFileSync('src/assets/icons/PlaceMark.svg', 'utf8')
    const svgLoader = new SVGLoader()
    const svgObj = svgLoader.parse(svgBuf)
    const svgGroup = getSvgGroupFromObj({svgObj})
    deletePropertyRecursive(svgGroup, 'uuid')
    deleteStringValueMatchRecursive(svgGroup, UUID_REGEX)
    expect(svgGroup).toMatchSnapshot()
  })

  it('getSvgSpriteFromEl snapshot of PlaceMarkSvg matches', () => {
    const fs = require('fs')
    const svgStr = fs.readFileSync('src/assets/icons/PlaceMark.svg', 'utf8')
    const svgEl = getSvgElFromStr(svgStr)
    const svgSprite = getSvgSpriteFromEl({svgEl})
    deletePropertyRecursive(svgSprite, 'uuid')
    deleteStringValueMatchRecursive(svgSprite, UUID_REGEX)
    expect(svgSprite).toMatchSnapshot()
  })
})
