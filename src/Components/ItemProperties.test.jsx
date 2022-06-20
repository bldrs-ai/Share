import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'
import ItemProperties from './ItemProperties'
import {MockModel} from '../utils/IfcMock.test'
import {MockRoutes} from '../BaseRoutesMock.test'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'


test('ItemProperties for single element', async () => {
  const testLabel = 10
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.setSelectedElement({expressID: 10})
  })
  act(() => {
    result.current.setModelStore(new MockModel)
  })

  const {getByText} = render(
      <MockRoutes
        contentElt={
          <ItemProperties/>}/>)
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
