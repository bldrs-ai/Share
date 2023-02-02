import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import useStore from '../../store/useStore'
import ShareMock from '../../ShareMock'
import SideDrawer from './SideDrawer'


describe('SideDrawer', () => {
  it('notes', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {findByText} = render(<ShareMock><SideDrawer/></ShareMock>)
    await act(() => {
      result.current.toggleIsNotesOn()
      result.current.openDrawer()
    })
    expect(await findByText('Notes')).toBeVisible()

    // reset the store
    await act(() => {
      result.current.closeNotes()
    })
  })

  it('properties', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {findByText} = render(<ShareMock><SideDrawer/></ShareMock>)
    await act(() => {
      result.current.toggleIsPropertiesOn()
      result.current.openDrawer()
    })
    expect(await findByText('Properties')).toBeVisible()

    // reset the store
    await act(() => {
      result.current.setSelectedElement({})
      result.current.toggleIsPropertiesOn()
    })
  })
})
