import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import useStore from '../store/useStore'
import ShareMock from '../ShareMock'
import {newMockStringValueElt} from '../utils/IfcMock.test'
import NavTree from './NavTree'
import {IfcViewerAPIExtended} from '../Infrastructure/IfcViewerAPIExtended'
import {actAsyncFlush} from '../utils/tests'


describe('CadView', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('NavTree for single element', async () => {
    const testLabel = 'Test node label'
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = new IfcViewerAPIExtended()
    await act(() => {
      result.current.setViewerStore(viewer)
    })
    const {getByText} = render(
        <ShareMock>
          <NavTree
            element={newMockStringValueElt(testLabel)}
          />
        </ShareMock>)
    await actAsyncFlush()
    expect(getByText(testLabel)).toBeInTheDocument()
  })
})
