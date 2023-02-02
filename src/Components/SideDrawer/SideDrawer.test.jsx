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
    const xResizerEl = getByTestId('x_resizer')
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    expect(storeHook.result.current.isSidebarXExpanded).toBe(false)
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    expect(storeHook.result.current.isSidebarXExpanded).toBe(true)
    const yResizerEl = getByTestId('y_resizer')
    fireEvent.click(yResizerEl)
    fireEvent.click(yResizerEl)
    expect(storeHook.result.current.isSidebarYExpanded).toBe(false)
    fireEvent.click(yResizerEl)
    fireEvent.click(yResizerEl)
    expect(storeHook.result.current.isSidebarYExpanded).toBe(true)
  })
})
