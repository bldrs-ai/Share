import React from 'react'
import {act, render, renderHook, fireEvent} from '@testing-library/react'
import useStore from '../../store/useStore'
import ShareMock from '../../ShareMock'
import SideDrawer from './SideDrawer'
import {useIsMobile, MOBILE_WIDTH} from '../Hooks'


describe('SideDrawer', () => {
  it('notes', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {findByText} = render(<ShareMock><SideDrawer/></ShareMock>)
    await act(() => {
      result.current.turnCommentsOn()
      result.current.openDrawer()
    })
    expect(await findByText('Notes')).toBeVisible()

    // reset the store
    await act(() => {
      result.current.turnCommentsOff()
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
    window.innerWidth = MOBILE_WIDTH
    window.dispatchEvent(new Event('resize'))
    expect(window.innerWidth).toBe(MOBILE_WIDTH)
    const mobileHook = renderHook(() => useIsMobile())
    expect(mobileHook.result.current).toBe(true)
    const storeHook = renderHook(() => useStore((state) => state))
    const {getByTestId, findByText} = render(<ShareMock><SideDrawer/></ShareMock>)
    await act(() => {
      storeHook.result.current.turnCommentsOn()
      storeHook.result.current.openDrawer()
    })
    expect(await findByText('Notes')).toBeVisible()
    const yResizerEl = getByTestId('y_resizer')
    fireEvent.click(yResizerEl)
    fireEvent.click(yResizerEl)
    expect(storeHook.result.current.isSidebarExpanded).toBe(false)
    fireEvent.click(yResizerEl)
    fireEvent.click(yResizerEl)
    expect(storeHook.result.current.isSidebarExpanded).toBe(true)
  })
})
