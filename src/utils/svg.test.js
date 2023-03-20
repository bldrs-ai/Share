import {deletePropertyRecursive, deleteStringValueMatchRecursive} from './objects'
import {UUID_REGEX} from './strings'
import {getSvgGroupFromObj, getSpriteFromSvgCanvas} from './svg'


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

  it('getSpriteFromSvgCanvas snapshot of PlaceMarkSvg matches', () => {
    const svgCanvas = document.createElement('canvas')
    const svgSprite = getSpriteFromSvgCanvas({svgCanvas})
    deletePropertyRecursive(svgSprite, 'uuid')
    deletePropertyRecursive(svgSprite, 'images')
    deletePropertyRecursive(svgSprite, 'image')
    deleteStringValueMatchRecursive(svgSprite, UUID_REGEX)
    expect(svgSprite).toMatchSnapshot()
  })
})
