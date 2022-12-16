import React from 'react'
import {render} from '@testing-library/react'
import ShareMock from '../ShareMock'
import {MockViewer, newMockStringValueElt} from '../utils/IfcMock.test'
import NavTree from './NavTree'


test('NavTree for single element', () => {
  const testLabel = 'Test node label'
  const {getByText} = render(
      <ShareMock>
        <NavTree
          viewer={new MockViewer()}
          element={newMockStringValueElt(testLabel)}
        />
      </ShareMock>,
  )
  expect(getByText(testLabel)).toBeInTheDocument()
})
