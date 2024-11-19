/* eslint-disable require-await */
import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import NotesControl from './NotesControl'
import model from '../../__mocks__/MockModel.js'


window.HTMLElement.prototype.scrollIntoView = jest.fn()


describe('NotesControl', () => {
  it('Does not issue fetch on initial page load when not visible', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(async () => {
      result.current.setNotes(null)
      result.current.setModel(model)
      result.current.setRepository('pablo-mayrgundter', 'Share')
    })
    await act(async () => {
      render(<ShareMock><NotesControl/></ShareMock>)
    })
    expect(result.current.notes).toBeNull()
  })

  it('Fetches issues on initial render when isNotesVisible in zustand', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(async () => {
      result.current.setNotes(null)
      result.current.setModel(model)
      result.current.setRepository('pablo-mayrgundter', 'Share')
      result.current.setIsNotesVisible(true)
    })
    await act(async () => {
      render(<ShareMock><NotesControl/></ShareMock>)
    })
    expect(result.current.notes).toHaveLength(4)
  })

  it('Fetches issues when isNotesVisible in zustand', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(async () => {
      result.current.setNotes(null)
      result.current.setModel(model)
      result.current.setRepository('pablo-mayrgundter', 'Share')
      result.current.setIsNotesVisible(false)
    })
    await act(async () => {
      render(<ShareMock><NotesControl/></ShareMock>)
    })
    expect(result.current.notes).toBeNull()
    await act(async () => {
      result.current.setIsNotesVisible(true)
    })
    expect(result.current.notes).toHaveLength(4)
  })
})

