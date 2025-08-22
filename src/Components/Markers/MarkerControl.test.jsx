import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import MarkerControl from './MarkerControl'
import CadView from '../../Containers/CadView'
import {MOCK_MARKERS} from './Marker.fixture'
import {IfcViewerAPIExtended} from '../../Infrastructure/IfcViewerAPIExtended'
import {makeTestTree} from '../../utils/TreeUtils.test'
import {actAsyncFlush} from '../../utils/tests'
import {Mesh, BoxGeometry, MeshBasicMaterial} from 'three'
import {HASH_PREFIX_NOTES} from '../../Components/Notes/hashState'
import {HASH_PREFIX_PLACE_MARK} from './hashState'


window.HTMLElement.prototype.scrollIntoView = jest.fn()
const mockedUseNavigate = jest.fn()
const defaultLocationValue = {pathname: '/index.ifc', search: '', hash: '', state: null, key: 'default'}
// mock createObjectURL
global.URL.createObjectURL = jest.fn(() => '1111111111111111111111111111111111111111')
// In your test file, put this FIRST (hoisted by Jest):
jest.mock('../../OPFS/OPFSService.js', () => ({
  initializeWorker: () => null, // fix import.meta
}))

jest.mock('../../OPFS/utils', () => {
  const actualUtils = jest.requireActual('../../OPFS/utils')
  const fs = jest.requireActual('fs')
  const path = jest.requireActual('path')
  const Blob = jest.requireActual('node:buffer').Blob

  /**
   * FileMock - Mocks File Web Interface
   */
  class FileMock {
    /**
     *
     * @param {Blob} blobParts
     * @param {string} fileName
     * @param {any} options
     */
    constructor(blobParts, fileName, options) {
      this.blobParts = blobParts
      this.name = fileName
      this.lastModified = options.lastModified || Date.now()
      this.type = options.type
      // Implement other properties and methods as needed for your tests
    }

    // Implement any required methods (e.g., slice, arrayBuffer, text) if your code uses them
  }

  return {
    ...actualUtils, // Preserve other exports from the module
    downloadToOPFS: jest.fn().mockImplementation(() => {
      // Read the file content from disk
      const fileContent = fs.readFileSync(path.join(__dirname, './index.ifc'), 'utf8')

      const uint8Array = new Uint8Array(fileContent)
      const blob = new Blob([uint8Array])

      // The lastModified property is optional, and can be omitted or set to Date.now() if needed
      const file = new FileMock([blob], 'index.ifc', {type: 'text/plain', lastModified: Date.now()})
      // Return the mocked File in a promise if it's an async function
      return Promise.resolve(file)
    }),
    downloadModel: jest.fn().mockImplementation(() => {
      // Read the file content from disk
      const fileContent = fs.readFileSync(path.join(__dirname, './index.ifc'), 'utf8')

      const uint8Array = new Uint8Array(fileContent)
      const blob = new Blob([uint8Array])

      // The lastModified property is optional, and can be omitted or set to Date.now() if needed
      const file = new FileMock([blob], 'index.ifc', {type: 'text/plain', lastModified: Date.now()})
      // Return the mocked File in a promise if it's an async function
      return Promise.resolve(file)
    }),
  }
})


jest.mock('react-router-dom', () => {
  return {
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockedUseNavigate,
    useLocation: jest.fn(() => defaultLocationValue),
  }
})
jest.mock('postprocessing')
jest.mock('@auth0/auth0-react', () => {
  return {
    ...jest.requireActual('@auth0/auth0-react'),
    useAuth0: () => jest.fn(() => {
      return {
        isLoading: () => false,
        isAuthenticated: () => false,
      }
    }),
  }
})

describe('MarkerControl', () => {
    let viewer

    let originalWorker

    beforeAll(() => {
      // Store the original Worker in case other tests need it
      originalWorker = global.Worker
    })


    // TODO: `document.createElement` can't be used in testing-library directly,
    // need to move this after fixing that issue
    beforeEach(() => {
      viewer = new IfcViewerAPIExtended()
      viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValue(makeTestTree())
      viewer.context.getDomElement = jest.fn(() => {
        return document.createElement('div')
      })
    })


    afterEach(() => {
      jest.clearAllMocks()
      global.Worker = originalWorker
    })

  // Properly mock viewer context
  const mockCanvas = document.createElement('canvas')
  const mockContext = {
    getDomElement: jest.fn(() => mockCanvas), // Return the mocked canvas element
    getCamera: jest.fn(() => ({
      position: {x: 0, y: 0, z: 0},
    })),
    getScene: jest.fn(() => ({
      children: [],
    })),
  }

  // Create mock opposite objects
  const mockOppositeObjects = [
    new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({color: 0x00ff00}),
    ),
    new Mesh(
      new BoxGeometry(2, 2, 2),
      new MeshBasicMaterial({color: 0xff0000}),
    ),
  ]
  const mockPostProcessor = {}

  beforeEach(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    await act(() => {
      result.current.writeMarkers([])
      result.current.setSelectedPlaceMarkId(null)
    })
  })

  it('Renders MarkerControl without crashing', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    const {container} = render(
      <ShareMock>
       <CadView installPrefix='/' appPrefix='' pathPrefix='' modelPath={{filepath: '/index.ifc'}}/>
          <MarkerControl
            context={mockContext}
            oppositeObjects={mockOppositeObjects}
            postProcessor={mockPostProcessor}
          />
      </ShareMock>,
    )
    await actAsyncFlush()
    expect(container).toBeInTheDocument()
  })

  it('Updates the hash based on the selected placemark', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(
      <ShareMock>
        <CadView installPrefix='/' appPrefix='' pathPrefix='' modelPath={{filepath: '/index.ifc'}}/>
          <MarkerControl
            context={mockContext}
            oppositeObjects={mockOppositeObjects}
            postProcessor={mockPostProcessor}
          />
      </ShareMock>,
    )

    await actAsyncFlush()

    await act(() => {
      result.current.writeMarkers(MOCK_MARKERS)
    })

    await act(() => {
      result.current.setSelectedPlaceMarkId(MOCK_MARKERS[0].id)
    })

    const {coordinates, id} = MOCK_MARKERS[0]
    const expectedHash = `#${HASH_PREFIX_PLACE_MARK}:${coordinates.join(',')};${HASH_PREFIX_NOTES}:${id}`

    expect(window.location.hash).toBe(expectedHash)
  })
})
