import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import NotesControl from './NotesControl'
import model from '../../__mocks__/MockModel.js'


describe('Notes Control', () => {
  beforeEach(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setNotes(null)
      result.current.setModel(model)
    })
  })

  it.only('Setting notes in zustand', () => {
    render(<ShareMock><NotesControl/></ShareMock>)
  })
})

