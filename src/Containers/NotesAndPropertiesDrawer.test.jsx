import React from 'react'
import {act, render, renderHook, fireEvent} from '@testing-library/react'
import {useIsMobile} from '../Components/Hooks'
import {TITLE_NOTES} from '../Components/Notes/NotesPanel'
import {TITLE as TITLE_PROPS} from '../Components/Properties/PropertiesPanel'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import NotesAndPropertiesDrawer from './NotesAndPropertiesDrawer'


describe('NotesAndPropertiesDrawer', () => {
  it('properties panel renders', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {findByText} = render(<ShareMock><NotesAndPropertiesDrawer/></ShareMock>)
    await act(() => {
      result.current.setIsPropertiesVisible(true)
    })
    expect(await findByText(TITLE_PROPS)).toBeVisible()
    // reset the store
    await act(() => {
      result.current.setSelectedElement({})
      result.current.toggleIsPropertiesVisible()
    })
  })

  it('double-click resizes horizontally', async () => {
    const mobileHook = renderHook(() => useIsMobile())
    const storeHook = renderHook(() => useStore((state) => state))
    const notesAndPropsRender = render(<ShareMock><NotesAndPropertiesDrawer/></ShareMock>)
    await act(() => {
      storeHook.result.current.toggleIsNotesVisible()
    })
    expect(await notesAndPropsRender.findByText(TITLE_NOTES)).toBeVisible()
    expect(mobileHook.result.current).toBe(false)
    const leftDrawerWidthInitial = storeHook.result.current.leftDrawerWidthInitial
    const xResizerEl = notesAndPropsRender.getByTestId('x_resizer')
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    const expectedWidth = 350 // TODO(pablo): hack, should be window.innerWidth
    expect(storeHook.result.current.leftDrawerWidth).toBe(expectedWidth)
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    expect(storeHook.result.current.leftDrawerWidth).toBe(leftDrawerWidthInitial)
  })
})
