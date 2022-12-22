import React from 'react'
import {act, fireEvent, render, renderHook, waitFor, waitForElementToBeRemoved} from '@testing-library/react'
import {__getIfcViewerAPIMockSingleton} from 'web-ifc-viewer'
import useStore from '../store/useStore'
import ShareMock from '../ShareMock'
import {createFakeTree} from '../utils/TreeUtils.test'
import CadView from './CadView'
import '@testing-library/jest-dom'
import {visitTree} from '../utils/TreeUtils'


let viewerMock
let testTree
let testProperties


describe('CadView', () => {
  beforeEach(() => {
    viewerMock = __getIfcViewerAPIMockSingleton()
    testTree = createFakeTree()
    testProperties = {}

    testProperties[testTree.expressID] = {
      Name: testTree.Name || null,
      LongName: testTree.LongName || null,
    }

    visitTree(testTree, (child, parent) => {
      testProperties[child.expressID] = {
        Name: child.Name || null,
        LongName: child.LongName || null,
      }
    })

    viewerMock._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(new Promise(function(resolve, reject) {
      resolve(testTree)
    }))

    viewerMock.getProperties.mockImplementation((modelID, expressID, indirect, recursive) => new Promise(function(resolve, reject) {
      if (expressID in testProperties) {
        resolve(testProperties[expressID])
      }

      reject(new Error(`express ID ${expressID} not found`))
    }))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders an IFC correctly', async () => {
    const modelPath = {
      filepath: `index.ifc`,
    }

    const {container, findByText, queryByText} = render(
        <CadView
          installPrefix={''}
          appPrefix={''}
          pathPrefix={''}
          modelPath={modelPath}
        />,
        {
          wrapper: ({children}) => <ShareMock>{children}</ShareMock>,
        },
    )

    await waitFor(() => {
      expect(container.querySelector('div[data-model-ready]')
          .getAttribute('data-model-ready'))
          .toEqual('true')
    })

    const loadingMessage = `Loading index.ifc`
    await findByText(loadingMessage)
    await waitForElementToBeRemoved(() => queryByText(loadingMessage))

    await waitFor(() => {
      expect(container.querySelector('div[data-model-ready]')
          .getAttribute('data-model-ready'))
          .toEqual('true')
    })

    // Assert mocks were executed as expected
    const expectedNumOfCalls = 1
    expect(viewerMock._loadedModel.ifcManager.getSpatialStructure).toHaveBeenCalledTimes(expectedNumOfCalls)
  })

  it('renders and selects the element ID from URL', async () => {
    const targetElementId = testTree.children[0].expressID
    const targetElementName = testTree.children[0].Name.value
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }

    const {result} = renderHook(() => useStore((state) => state))
    const {container, findByLabelText, findByText, findByPlaceholderText, findByTitle} = render(
        <CadView
          installPrefix={''}
          appPrefix={''}
          pathPrefix={''}
          modelPath={modelPath}
        />,
        {
          wrapper: ({children}) => <ShareMock initialEntries={[`/share/v/p/index.ifc/${targetElementId}`]}>{children}</ShareMock>,
        },
    )

    await findByTitle('Open IFC')
    await findByPlaceholderText('Search / Insert GitHub link')

    await findByLabelText('IFC Navigator')
    await findByText(targetElementName)

    await waitFor(() => {
      expect(container.querySelector('div[data-model-ready]')
          .getAttribute('data-model-ready'))
          .toEqual('true')
    })

    expect(result.current.selectedElements).toEqual([`${targetElementId}`])
    expect(result.current.selectedElement.Name.value).toEqual('Fake Site')

    const expectedNumOfCalls = 2 // First for root, second from URL path
    expect(viewerMock.getProperties).toHaveBeenCalledTimes(expectedNumOfCalls)
    expect(viewerMock.getProperties).toHaveBeenCalledWith(0, testTree.expressID)
    expect(viewerMock.getProperties).toHaveBeenCalledWith(0, targetElementId)
  })

  /* it('clear elements and planes on unselect', async () => {
    const targetElementId = testTree.children[0].expressID
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }
    viewerMock._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(testTree)
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedElement(targetElementId)
      result.current.setSelectedElements([targetElementId])
      result.current.setCutPlaneDirection('y')
      result.current.setLevelInstance(null)
    })

    const {container, getByTitle} = render(
        <CadView
          installPrefix={''}
          appPrefix={''}
          pathPrefix={''}
          modelPath={modelPath}
        />,
        {
          wrapper: ({children}) => <ShareMock initialEntries={[`/share/v/p/index.ifc/${targetElementId}`]}>{children}</ShareMock>,
        },
    )

    await waitFor(() => {
      expect(container.querySelector('div[data-model-ready]')
          .getAttribute('data-model-ready'))
          .toEqual('true')
    })

    const clearSelection = getByTitle('Clear')
    await act(() => {
      fireEvent.click(clearSelection)
    })

    const expectedNumOfCalls = 1
    expect(viewerMock.clipper.deleteAllPlanes).toHaveBeenCalledTimes(expectedNumOfCalls)

    expect(result.current.selectedElements).toEqual([])
    expect(result.current.selectedElement).toBe(null)
    expect(result.current.cutPlaneDirection).toBe(null)
    expect(result.current.levelInstance).toBe(null)
  }) */
})
