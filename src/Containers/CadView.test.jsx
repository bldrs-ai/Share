import React from 'react'
import {render, waitFor, renderHook, act} from '@testing-library/react'
import CadView from './CadView'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import IfcjsMock from '../__mocks__/web-ifc-viewer.js'
// import {IfcViewerAPI} from 'web-ifc-viewer'


// TODO(pablo): This mock suppresses "WARNING: Multiple instances of
// Three.js being imported", but why is it being included if
// web-ifc-viewer is being mocked?
jest.mock('three')

jest.mock('web-ifc-viewer')

describe('CadView', () => {
  it('renders with mock IfcViewerAPI', async () => {
    // Mock IfcViewerApi is in $repo/__mocks__/web-ifc-viewer.js
    const modelId = 1234
    const modelPath = {
      filepath: `index.ifc/${modelId}`,
      gitPath: 'foo',
    }
    const {result} = renderHook(() => useStore((state) => state))
    const {getByTitle, debug} = render(
        <ShareMock>
          <CadView
            installPrefix={''}
            appPrefix={''}
            pathPrefix={''}
            modelPath={modelPath}
          />
        </ShareMock>)
    debug()
    await act(() => result.current.setModelPath(modelPath))
    const viewer = new IfcjsMock()
    console.log('viewer', viewer.IFC.getProperties())
    // Necessary to wait for some of the component to render to avoid
    // act() warningings from testing-library.
    await waitFor(() => getByTitle(/Bldrs: 1.0.0/i))
  })
})
