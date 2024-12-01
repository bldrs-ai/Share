import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import useStore from '../../store/useStore'
import PropertiesPanel, {TITLE} from './PropertiesPanel'
import {RouteThemeCtx} from '../../Share.fixture'


describe('PropertiesPanel', () => {
  it('renders', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByText} = render(<PropertiesPanel/>, {wrapper: RouteThemeCtx})
    await act(() => {
      result.current.setSelectedNoteId(null)
    })
    expect(getByText(TITLE)).toBeInTheDocument()
  })
})
