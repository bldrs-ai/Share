import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'
import CadView from './CadView'
import ShareMock from '../ShareMock'


jest.mock('three')
jest.mock('web-ifc-viewer')

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
