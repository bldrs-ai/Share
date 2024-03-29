import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import PropertiesPanel from '../Properties/PropertiesPanel'
import NotesPanel from '../Notes/NotesPanel'


describe('SideDrawerPanels', () => {
  it('Notes', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByText} = render(<ShareMock><NotesPanel/></ShareMock>)
    await act(() => {
      result.current.setSelectedNoteId(null)
    })
    expect(getByText('NOTES')).toBeInTheDocument()
  })

  it('Properties', () => {
    const {getByText} = render(<ShareMock><PropertiesPanel/></ShareMock>)
    expect(getByText('PROPERTIES')).toBeInTheDocument()
  })
})
