import React from 'react'
import {act, render, renderHook, fireEvent} from '@testing-library/react'
import useStore from '../../store/useStore'
import ShareMock from '../../ShareMock'
import {MOBILE_WIDTH} from '../../utils/constants'
import {useIsMobile} from '../Hooks'
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

  it('mobile vertical resizing', async () => {
    const mobileHook = renderHook(() => useIsMobile())
    const storeHook = renderHook(() => useStore((state) => state))
    const sideDrawerRender = render(<ShareMock><SideDrawer/></ShareMock>)
    await act(() => {
      storeHook.result.current.toggleIsNotesOn()
      storeHook.result.current.openDrawer()
    })
    expect(await sideDrawerRender.findByText('Notes')).toBeVisible()
    expect(mobileHook.result.current).toBe(false)
    const xResizerEl = sideDrawerRender.getByTestId('x_resizer')
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    expect(storeHook.result.current.sidebarWidth).toBe(window.innerWidth)
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    expect(storeHook.result.current.sidebarWidth).toBe(MOBILE_WIDTH)
  })
})
