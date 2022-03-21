import React from 'react'
import {render} from '@testing-library/react'
import {MockViewer, newMockStringValueElt} from '../utils/IfcMock.test'
import {MockRoutes} from '../BaseRoutesMock.test'
import NavTree from './NavTree'


test('NavTree for single element', () => {
  const testLabel = 'Test node label'
  const {getByText} = render(
      <MockRoutes
        contentElt={
          <NavTree
            viewer={new MockViewer}
            element={newMockStringValueElt(testLabel)}/>}/>)
  expect(getByText(testLabel)).toBeInTheDocument()
})
