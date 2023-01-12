import React, {useState} from 'react'
import {render, renderHook, act, fireEvent, screen, waitFor} from '@testing-library/react'
import {__getIfcViewerAPIMockSingleton} from 'web-ifc-viewer'
import useStore from '../store/useStore'
import ShareMock from '../ShareMock'
import {actAsyncFlush} from '../utils/tests'
import {makeTestTree} from '../utils/TreeUtils.test'
import CadView from './CadView'


describe('CadView', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders with mock IfcViewerAPI', async () => {
    const modelPath = {
      filepath: `index.ifc`,
    }
    const viewer = __getIfcViewerAPIMockSingleton()
    viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(makeTestTree())
    const {result} = renderHook(() => useState(modelPath))
    render(
        <ShareMock>
          <CadView
            installPrefix={''}
            appPrefix={''}
            pathPrefix={''}
            modelPath={result.current[0]}
          />
        </ShareMock>)
    // Necessary to wait for some of the component to render to avoid
    // act() warnings from testing-library.
    await waitFor(() => screen.getByTitle(/Bldrs: 1.0.0/i))
    await actAsyncFlush()
  })

  it('renders and selects the element ID from URL', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    const modelPath = {

      filepath: `index.ifc/${targetEltId}`,
      gitpath: undefined,
    }
    const viewer = __getIfcViewerAPIMockSingleton()
    viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(testTree)
    const {result} = renderHook(() => useState(modelPath))
    render(
        <ShareMock>
          <CadView
            installPrefix={'/'}
            appPrefix={'/'}
            pathPrefix={'/'}
            modelPath={result.current[0]}
          />
        </ShareMock>)
    await waitFor(() => screen.getByTitle(/Bldrs: 1.0.0/i))
    await actAsyncFlush()
    const getPropsCalls = viewer.getProperties.mock.calls
    const numCallsExpected = 2 // First for root, second from URL path
    expect(getPropsCalls.length).toBe(numCallsExpected)
    expect(getPropsCalls[0][0]).toBe(0) // call 1, arg 1
    expect(getPropsCalls[0][0]).toBe(0) // call 2, arg 2
    expect(getPropsCalls[1][0]).toBe(0) // call 2, arg 1
    expect(getPropsCalls[1][1]).toBe(targetEltId) // call 2, arg 2
    await actAsyncFlush()
  })

  it('clear elements and planes on unselect', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    const modelPath = {
      filepath: `index.ifc/${targetEltId}`,
      gitpath: undefined,
    }
    const viewer = __getIfcViewerAPIMockSingleton()
    viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(testTree)
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedElement(targetEltId)
      result.current.setSelectedElements([targetEltId])
      result.current.setCutPlaneDirection('y')
    })
    const {getByTitle} = render(
        <ShareMock>
          <CadView
            installPrefix={'/'}
            appPrefix={'/'}
            pathPrefix={'/'}
            modelPath={modelPath}
          />
        </ShareMock>)
    expect(getByTitle('Section')).toBeInTheDocument()
    const clearSelection = getByTitle('Clear')
    act(() => {
      fireEvent.click(clearSelection)
    })
    const callDeletePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    expect(callDeletePlanes.length).toBe(1)
    expect(result.current.selectedElements).toBe(null)
    expect(result.current.selectedElement).toBe(null)
    expect(result.current.cutPlaneDirection).toBe(null)
    await actAsyncFlush()
  })

  // it('prevent reloading without user approval when loading a model from local', async () => {
  //   render(<CadView/>)
  //   await new Promise((r) => setTimeout(r, '500'))

  //   const infos = within(screen.getByTestId('infos'))
  //   await waitFor(() => expect(infos.getByText('R$ 2.400,00')).toBeInTheDocument())

  //   const uploadForm = screen.getAllByTestId('upload-form')
  //   fireEvent.drop(uploadForm[3], {
  //     dataTransfer: {
  //       files: [new File(['(⌐□_□)'], 'chucknorris.png', {type: 'image/png'})],
  //     },
  //   })

  //   await waitFor(() =>
  //     expect(screen.getByText('chucknorris.jpg enviado com sucesso!')).toBeInTheDocument(),
  //   )
  // })
})

/**
 *
 */
function main() {
  const blob = new Blob(['testing'], {type: 'application/pdf'})
  console.log(blob)
}

describe('pdf blob', () => {
  it('should mock correctly', () => {
    const mBlob = {size: 1024, type: 'application/pdf'}
    const blobSpy = jest.spyOn(global, 'Blob').mockImplementationOnce(() => mBlob)
    const logSpy = jest.spyOn(console, 'log')
    main()
    expect(blobSpy).toBeCalledWith(['testing'], {
      type: 'application/pdf',
    })
    expect(logSpy).toBeCalledWith(mBlob)
  })
})
