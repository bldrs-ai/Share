import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'
import ItemProperties from './ItemProperties'
// eslint-disable-next-line no-unused-vars
import testObj from './ItemProperties.testobj.json'
import {MockModel, newMockStringValueElt} from '../utils/IfcMock.test'
import {mockRoutes} from '../BaseRoutesMock.test'


test('ItemProperties for single element', async () => {
  const testLabel = 'Test node label'
  const {getByText} = render(mockRoutes(
      <ItemProperties
        model={new MockModel}
        element={newMockStringValueElt(testLabel)} />,
  ))
  await waitFor(() => screen.getByText(testLabel))
  expect(getByText(testLabel)).toBeInTheDocument()
})


test('ItemProperties for single element', async () => {
  const testLabel = 'Test node label'
  const {getByText} = render(mockRoutes(
      <ItemProperties
        model={new MockModel}
        element={newMockStringValueElt(testLabel)} />,
  ))
  await waitFor(() => screen.getByText(testLabel))
  expect(getByText(testLabel)).toBeInTheDocument()
})


// TODO(pablo):
/*
test('ItemProperties for testObj', async () => {
  const testLabel = 'Test node label'
  const {getByText} = render(mockRoutes(
      <ItemProperties
        model={new MockModel}
        element={testObj} />,
  ))
  await waitFor(() => screen.getByText(testLabel))
  expect(getByText(testLabel)).toBeInTheDocument()
})
*/
