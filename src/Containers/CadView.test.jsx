import React, {useState} from 'react'
import {render, renderHook, screen, waitFor} from '@testing-library/react'
import CadView from './CadView'
import ShareMock from '../ShareMock'
import {actAsyncFlush} from '../utils/tests'
import {__getIfcViewerAPIMockSingleton} from 'web-ifc-viewer'


describe('CadView', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })


  it('renders with mock IfcViewerAPI', async () => {
    const modelPath = {
      filepath: `index.ifc`,
    }
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
    // act() warningings from testing-library.
    await waitFor(() => screen.getByTitle(/Bldrs: 1.0.0/i))
    await actAsyncFlush()
  })


  it('renders and selects the element ID from URL', async () => {
    const eltId = 1234
    const modelPath = {
      filepath: `index.ifc/${eltId}`,
      gitpath: undefined,
    }
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
    const viewer = __getIfcViewerAPIMockSingleton()
    const getPropsCalls = viewer.getProperties.mock.calls
    const numCallsExpected = 2 // First for root, second from URL path
    expect(getPropsCalls.length).toBe(numCallsExpected)
    expect(getPropsCalls[0][0]).toBe(0) // call 1, arg 1
    expect(getPropsCalls[0][0]).toBe(0) // call 2, arg 2
    expect(getPropsCalls[1][0]).toBe(0) // call 2, arg 1
    expect(getPropsCalls[1][1]).toBe(eltId) // call 2, arg 2
    await actAsyncFlush()
  })
})

