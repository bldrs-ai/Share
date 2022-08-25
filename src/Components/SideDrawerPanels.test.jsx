import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import {NotesPanel, PropertiesPanel} from './SideDrawerPanels'


test('Notes panel', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  const {getByText} = render(<ShareMock><NotesPanel/></ShareMock>)
  await act(() => {
    result.current.setSelectedIssueId(null)
  })
  expect(getByText('Notes')).toBeInTheDocument()
})


test('Properties panel', () => {
  const {getByText} = render(<ShareMock><PropertiesPanel/></ShareMock>)
  expect(getByText('Properties')).toBeInTheDocument()
})
