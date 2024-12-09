import {deletePropertyRecursive, deleteStringValueMatchRecursive} from './objects'
import {UUID_REGEX} from './strings'
import {getSvgGroupFromObj, getSpriteFromSvgCanvas} from './svg'


const {SVGLoader} = jest.requireActual('three/examples/jsm/loaders/SVGLoader')


describe('svg', () => {
  it('getSvgGroupFromObj snapshot of PlaceMarkSvg matches', () => {
    const icon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7m0
                 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5"
        fill="#ffffff"/>
      </svg>`
    const svgLoader = new SVGLoader()
    const svgObj = svgLoader.parse(icon)
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
