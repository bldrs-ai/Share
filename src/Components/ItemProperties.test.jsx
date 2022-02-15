import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'
import {MockViewer, newMockStringValueElt} from '../utils/IfcMock.test'
import {mockRoutes} from '../BaseRoutesMock.test'
import ItemProperties from './ItemProperties'
// eslint-disable-next-line no-unused-vars
import testObj from './ItemProperties.testobj.json'


test('ItemProperties for single element', async () => {
  const testLabel = 'Test node label'
  const {getByText} = render(mockRoutes(
      <ItemProperties
        viewer={new MockViewer}
        element={newMockStringValueElt(testLabel)} />,
  ))
  await waitFor(() => screen.getByText(testLabel))
  expect(getByText(testLabel)).toBeInTheDocument()
})


test('ItemProperties for single element', async () => {
  const testLabel = 'Test node label'
  const {getByText} = render(mockRoutes(
      <ItemProperties
        viewer={new MockViewer}
        element={newMockStringValueElt(testLabel)} />,
  ))
  await waitFor(() => screen.getByText(testLabel))
  expect(getByText(testLabel)).toBeInTheDocument()
})

// TODO(pablo):
/*
test('ItemProperties for single element', async () => {
  const testLabel = 'Test node label'
  const {getByText} = render(mockRoutes(
      <ItemProperties
        viewer={new MockViewer}
        element={testObj} />,
  ))
  await waitFor(() => screen.getByText(testLabel))
  expect(getByText(testLabel)).toBeInTheDocument()
})
*/
