import React from 'react'
import {render, waitFor, renderHook, act} from '@testing-library/react'
import CadView from './CadView'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import {IfcViewerAPI} from 'web-ifc-viewer'


// TODO(pablo): This mock suppresses "WARNING: Multiple instances of
// Three.js being imported", but why is it being included if
// web-ifc-viewer is being mocked?
jest.mock('three')

jest.mock('web-ifc-viewer')

describe('CadView', () => {
  it('', async () => {
    const modelId = 1234
    const modelPath = {
      filepath: `index.ifc/${modelId}`,
      gitPath: 'foo',
    }
    const {result} = renderHook(() => useStore((state) => state))
    const {getByTitle} = render(
        <ShareMock>
          <CadView
            installPrefix={''}
            appPrefix={''}
            pathPrefix={''}
          />
        </ShareMock>)
    await act(() => result.current.setModelPath(modelPath))
    await waitFor(() => getByTitle(/Bldrs: 1.0.0/i))
    // The mocked class actually returns a singleton instance.
    const viewer = new IfcViewerAPI()
    console.log('viewer', viewer)
    // debug()
    // expect(viewer.getProperties.mock.calls.length).toBe(1)
    // const firstCall = viewer.getProperties.mock.calls[0]
    // expect(firstCall[0]).toBe(0) // modelId
    // expect(firstCall[1]).toBe(modelId) // elementId
  })
})

