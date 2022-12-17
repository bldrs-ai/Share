import React from 'react'
import {render, screen} from '@testing-library/react'
import Dialog, {
  OpenDialogHeaderContent,
  OpenDialogBodyContent,
} from '../Components/Dialog_redesign'
import ShareMock from '../ShareMock'


test('Open Dialog', () => {
  render(
      <ShareMock>
        <Dialog
          headerContent={<OpenDialogHeaderContent/>}
          bodyContent={<OpenDialogBodyContent/>}
          headerText={'Open file'}
          isDialogDisplayed={true}
          setIsDialogDisplayed={() => console.log('setIsDialogDisplayed')}
        />
      </ShareMock>,
  )
  expect(screen.getByText('Open file')).toBeInTheDocument()
  expect(screen.getByText('Recommended Method')).toBeInTheDocument()
  expect(screen.getByText('Upload from device')).toBeInTheDocument()
  expect(screen.getByText('Load Sample Model')).toBeInTheDocument()
})
