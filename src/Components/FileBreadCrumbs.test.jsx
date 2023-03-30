import React from 'react'
import {render} from '@testing-library/react'
import {MockComponent} from '../__mocks__/MockComponent'
import FileBreadCrumbs from './FileBreadCrumbs'


describe('FileBreadCrumbs', () => {
  test('repo should be present', () => {
    const modelPath = {
      filepath: `/index.ifc`,
      org: 'bldrs-ai',
      repo: 'Share',
    }
    const rendered = render(
        <MockComponent>
          <FileBreadCrumbs
            modelPath={modelPath}
          />
        </MockComponent>)

    const text = rendered.getByText('Share')
    expect(text).toBeInTheDocument()
  })
})
