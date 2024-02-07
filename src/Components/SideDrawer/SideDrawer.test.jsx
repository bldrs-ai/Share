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
      result.current.toggleIsNotesVisible()
      result.current.setIsSideDrawerVisible(true)
    })
    expect(await findByText('NOTES')).toBeVisible()

    // reset the store
    await act(() => {
      result.current.setIsNotesVisible(false)
    })
  })

  it('properties', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {findByText} = render(<ShareMock><SideDrawer/></ShareMock>)
    await act(() => {
      result.current.setIsPropertiesVisible(true)
      result.current.setIsSideDrawerVisible(true)
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
    const sideDrawerRender = render(<ShareMock><SideDrawer/></ShareMock>)
    await act(() => {
      storeHook.result.current.toggleIsNotesVisible()
      storeHook.result.current.setIsSideDrawerVisible(true)
    })
    expect(await sideDrawerRender.findByText('NOTES')).toBeVisible()
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
