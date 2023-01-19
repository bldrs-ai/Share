import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import {NotesPanel, PropertiesPanel} from './SideDrawerPanels'


describe('SideDrawerPanels', () => {
  it('Notes', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByText} = render(<ShareMock><NotesPanel/></ShareMock>)
    await act(() => {
      result.current.setSelectedNoteId(null)
    })
    expect(getByText('Notes')).toBeInTheDocument()
  })

  it('Properties', () => {
    const {getByText} = render(<ShareMock><PropertiesPanel/></ShareMock>)
    expect(getByText('Properties')).toBeInTheDocument()
  })
})
