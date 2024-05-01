/* eslint-disable require-await */
import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import NotesControl from './NotesControl'
import model from '../../__mocks__/MockModel.js'


describe('NotesControl', () => {
  it('Fetch notes from issues endpoint and set notes in zustand', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(
      async () => {
        await act(() => {
          result.current.setNotes(null)
          result.current.setModel(model)
          result.current.setRepository('pablo-mayrgundter', 'Share')
        })
      })
      await act(async () => {
        render(<ShareMock><NotesControl/></ShareMock>)
      })
      expect(result.current.notes).toHaveLength(4)
    })
  })

