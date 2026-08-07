import React from 'react'
import {render} from '@testing-library/react'
import ShareMock from '../ShareMock'
import {testId as aboutControlTestId} from '../Components/About/AboutControl'
import BottomBar from './BottomBar'


describe('BottomBar', () => {
  it('shows the About logo by default', () => {
    const {queryByTestId} = render(
      <ShareMock><BottomBar deselectItems={jest.fn()}/></ShareMock>,
    )
    expect(queryByTestId(aboutControlTestId)).toBeInTheDocument()
  })

  // The ProjectsDrawer footer carries the only logo while the workspace
  // shell is on — see LogoMenu.
  it('drops the About logo with ?feature=workspace', () => {
    const {queryByTestId} = render(
      <ShareMock initialEntries={['/?feature=workspace']}>
        <BottomBar deselectItems={jest.fn()}/>
      </ShareMock>,
    )
    expect(queryByTestId(aboutControlTestId)).toBeNull()
  })
})
