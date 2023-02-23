// eslint-disable-next-line no-unused-vars
import {getSVGGroup, getSVGMesh} from './svg'
import {mockLoadedSvgObj, mockShapes} from '../__mocks__/svg'
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader'


jest.mock('three', () => {
  return {
    ...jest.requireActual('three'),
    Color: jest.fn().mockImplementation(() => {
      return {
        setStyle: jest.fn().mockReturnThis(),
        convertSRGBToLinear: jest.fn().mockReturnThis(),
      }
    }),
    FileLoader: jest.fn().mockImplementation(() => {
      return {
        loadAsync: jest.fn().mockImplementation(() => mockLoadedSvgObj),
      }
    }),
  }
})


jest.mock('three/examples/jsm/loaders/SVGLoader', () => {
  return {
    ...jest.requireActual('three/examples/jsm/loaders/SVGLoader'),
    SVGLoader: jest.fn().mockImplementation(() => {
      return {
        loadAsync: jest.fn().mockImplementation(() => mockLoadedSvgObj),
      }
    }),
  }
})


describe('svg', () => {
  beforeEach(() => {
    global.Image = class {
      // eslint-disable-next-line require-jsdoc
      constructor() {
        setTimeout(() => {
          this.onload() // simulate success
        // eslint-disable-next-line no-magic-numbers
        }, 100)
      }
    }
  })

  it('test getSVGGroup', async () => {
    SVGLoader.createShapes = jest.fn().mockImplementation(() => {
      return {
        ...mockShapes,
        extractPoints: jest.fn(),
      }
    })
    const svgGroup = await getSVGGroup({url: 'fake'})
    expect(svgGroup.children.length).toBe(1)
  })

  // TODO: Jest doesn't support `onload` of image tag, need to find a solution
  // it('test getSVGMesh', async () => {
  //   const svgMesh = await getSVGMesh({url: 'fake'})
  // })
})
