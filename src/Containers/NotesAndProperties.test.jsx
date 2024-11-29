import React from 'react'
import {act, render, renderHook, fireEvent} from '@testing-library/react'
import {useIsMobile} from '../Components/Hooks'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import NotesAndProperties from './NotesAndProperties'


describe('NotesAndProperties', () => {
  it('properties', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {findByText} = render(<ShareMock><NotesAndProperties/></ShareMock>)
    await act(() => {
      result.current.setIsPropertiesVisible(true)
    })
    expect(await findByText('PROPERTIES')).toBeVisible()

    // reset the store
    await act(() => {
      result.current.setSelectedElement({})
      result.current.toggleIsPropertiesVisible()
    })
  })

  it('mobile vertical resizing', async () => {
    const mobileHook = renderHook(() => useIsMobile())
    const storeHook = renderHook(() => useStore((state) => state))
    const notesAndPropsRender = render(<ShareMock><NotesAndProperties/></ShareMock>)
    await act(() => {
      storeHook.result.current.toggleIsNotesVisible()
      storeHook.result.current.setIsSideDrawerVisible(true)
    })
    expect(await notesAndPropsRender.findByText('NOTES')).toBeVisible()
    expect(mobileHook.result.current).toBe(false)
    const sidebarWidthInitial = storeHook.result.current.sidebarWidthInitial
    const xResizerEl = notesAndPropsRender.getByTestId('x_resizer')
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    expect(storeHook.result.current.sidebarWidth).toBe(window.innerWidth)
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    expect(storeHook.result.current.sidebarWidth).toBe(sidebarWidthInitial)
  })
})
