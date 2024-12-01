import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import useStore from '../../store/useStore'
import NotesPanel, {TITLE_NOTES} from './NotesPanel'
import {RouteThemeCtx} from '../../Share.fixture'


describe('NotesPanel', () => {
  it('renders', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByText} = render(<NotesPanel/>, {wrapper: RouteThemeCtx})
    await act(() => {
      result.current.setSelectedNoteId(null)
    })
    expect(getByText(TITLE_NOTES)).toBeInTheDocument()
  })
})
