import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import useStore from '../../store/useStore'
import {ThemeCtx} from '../../theme/Theme.fixture'
import SideDrawer from './SideDrawer'
import {ID_RESIZE_HANDLE_X} from './HorizonResizerButton'
import {useIsMobile} from '../Hooks'


jest.mock('../Hooks', () => ({
  useIsMobile: jest.fn(() => false),
}))

describe('SideDrawer', () => {
  const childText = 'NOTES'

  it('renders and drags', async () => {
    const mockSetDrawerWidth = jest.fn()
    const {findByText, getByTestId} = render(
      <SideDrawer
        isDrawerVisible={true}
        drawerWidth={100}
        drawerWidthInitial={100}
        setDrawerWidth={mockSetDrawerWidth}
      >
        {childText}
      </SideDrawer>,
      {wrapper: ThemeCtx},
    )
    expect(await findByText(childText)).toBeVisible()
    const resizeHandle = getByTestId(ID_RESIZE_HANDLE_X)
    const dragStart = 150
    const dragEnd = 100 // drag left 50px
    fireEvent.mouseDown(resizeHandle, {clientX: dragStart})
    fireEvent.mouseMove(document, {clientX: dragEnd})
    fireEvent.mouseUp(document)
    expect(mockSetDrawerWidth).toHaveBeenCalledWith(dragEnd, false)
  })

  context('mobile renders and drags', () => {
    it('renders vertical', async () => {
      const initHeight = 10
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => {
        result.current.setDrawerHeight(initHeight)
        result.current.setDrawerHeightInitial(initHeight)
      })
      useIsMobile.mockReturnValue(true)
      const {findByText} = render(
        <SideDrawer
          isDrawerVisible={true}
          drawerWidth={100}
          drawerWidthInitial={100}
          setDrawerWidth={jest.fn()}
        >
          {childText}
        </SideDrawer>,
        {wrapper: ThemeCtx},
      )
      expect(await findByText(childText)).toBeVisible()
      // TODO(pablo): test component isn't working like in hosted page, so can't
      // do sizing right
      /*
      const resizeHandle = getByTestId(ID_RESIZE_HANDLE_Y)
      const dragStart = initHeight
      const dragEnd = initHeight + 1
      fireEvent.mouseDown(resizeHandle, {clientY: dragStart})
      fireEvent.mouseMove(document, {clientY: dragEnd})
      fireEvent.mouseUp(document)
      expect(result.current.drawerHeight).toBe(dragEnd)
      */
    })
  })
})
