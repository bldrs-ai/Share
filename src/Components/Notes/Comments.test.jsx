/* eslint-disable no-magic-numbers */
import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import Notes from './Notes'
import {MOCK_NOTES} from '../../utils/GitHub'


describe('Notes Control', () => {
  beforeEach(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setNotes(MOCK_NOTES)
      result.current.setSelectedNoteId(10)
    })
  })

  it('Show create comment card when a note is selected', () => {
    const {getByTestId} = render(<ShareMock><Notes/></ShareMock>)
    expect(getByTestId('CreateComment')).toBeInTheDocument()
  })

  it.only('Do not show create comment card when a note is locked', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedNoteId(11)
    })
    const {getByText} = render(<ShareMock><Notes/></ShareMock>)
    expect(getByText('Note is locked')).toBeVisible()
  })

  it('Fetch and display Comments when note is selected', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {findByText} = render(<ShareMock><Notes/></ShareMock>)
    await act(() => {
      result.current.setNotes(MOCK_NOTES)
    })
    await act(() => {
      result.current.setSelectedNoteId(10)
    })
    expect(await findByText('Test Comment 1')).toBeVisible()
    expect(await findByText('Test Comment 2')).toBeVisible()
  })
})
