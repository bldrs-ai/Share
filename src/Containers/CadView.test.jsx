// TODO(pablo): This mock suppresses "WARNING: Multiple instances of
// Three.js being imported", but why is it being included if
// web-ifc-viewer is being mocked?
jest.mock('three')


import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'
import CadView from './CadView'
import ShareMock from '../ShareMock'


describe('CadView', () => {
  it('renders with mock IfcViewerAPI', async () => {
    // Mock IfcViewerApi is in $repo/__mocks__/web-ifc-viewer.js
    const modelPath = {
      gitPath: '',
    }
    render(
        <ShareMock>
          <CadView
            installPrefix={''}
            appPrefix={''}
            pathPrefix={''}
            modelPath={modelPath}
          />
        </ShareMock>)
    // Necessary to wait for some of the component to render to avoid
    // act() warningings from testing-library.
    await waitFor(() => screen.getByTitle(/Bldrs: 1.0.0/i))
  })
})
