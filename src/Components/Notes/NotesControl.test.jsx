import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import NotesControl from './Notes'


describe('Notes Control', () => {
  beforeEach(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setNotes(null)
    })
  })

  it('Setting notes in zustand', () => {
    render(<ShareMock><NotesControl/></ShareMock>)
  })
})
