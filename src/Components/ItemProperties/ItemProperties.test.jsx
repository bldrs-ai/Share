import React from 'react'
import {act, render, screen, waitFor, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import {MockModel} from '../../utils/IfcMock.test'
import useStore from '../../store/useStore'
import ItemProperties from './ItemProperties'


test('ItemProperties for single element', async () => {
  const testLabel = 10
  const {result} = renderHook(() => useStore((state) => state))
  await act(() => {
    result.current.setSelectedElement({expressID: 10})
    result.current.setModelStore(new MockModel)
  })

  const {getByText} = render(
      <ShareMock>
        <ItemProperties/>
      </ShareMock>)
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
