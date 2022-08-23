import React from 'react'
import {render} from '@testing-library/react'
import CadView from './CadView'
import ShareMock from '../ShareMock'


jest.mock('web-ifc-viewer')

import {IfcViewerAPI} from 'web-ifc-viewer'


const ifcObj = {
  IFC: {
    context: {
      ifcCamera: {
        cameraControls: {},
      },
    },
    setWasmPath: jest.fn(),
    loadIfcUrl: jest.fn(),
  },
  clipper: {
    active: false,
  },
  context: {
    resize: jest.fn(),
  },
}
IfcViewerAPI.mockImplementation(() => ifcObj)


describe('CadView', () => {
  it('renders with mock IfcViewerAPI', () => {
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
  })
})
