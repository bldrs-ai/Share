import React from 'react'
import {render, renderHook, act, fireEvent} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import AppsSideDrawer from './AppsSideDrawer'
import {ID_RESIZE_HANDLE_X} from '../Components/SideDrawer/HorizonResizerButton'


describe('AppsSideDrawer', () => {
  it('renders the Apps panel when visible', async () => {
    const mockSetDrawerWidth = jest.fn()
    const {result} = renderHook(() => useStore((state) => state))
    const {findByText} = render(<ShareMock><AppsSideDrawer setDrawerWidth={mockSetDrawerWidth}/></ShareMock>)

    await act(() => {
      result.current.setIsAppsVisible(true)
    })

    expect(await findByText('Apps')).toBeVisible()

    // Reset the store
    await act(() => {
      result.current.setIsAppsVisible(false)
    })
  })

  it('handles horizontal resizing with the resizer', async () => {
    const storeHook = renderHook(() => useStore((state) => state))

    let appsDrawerWidthSet = 0

    // Mock setDrawerWidth to update the store
    const mockSetDrawerWidth = jest.fn((newWidth) => {
      appsDrawerWidthSet = newWidth
    })

    await act(() => {
      storeHook.result.current.setIsAppsVisible(true)
    })

    // Wrap the render call
    const appsRender = render(
      <ShareMock>
        <AppsSideDrawer setDrawerWidth={mockSetDrawerWidth}/>
      </ShareMock>,
    )

    const resizerEl = appsRender.getByTestId(ID_RESIZE_HANDLE_X)

    // Simulate resizing
    fireEvent.mouseDown(resizerEl)
    fireEvent.mouseMove(document, {clientX: 400})
    fireEvent.mouseUp(document)

    // Assert the mock function was called
    expect(mockSetDrawerWidth).toHaveBeenCalled()

    await act(() => {
      storeHook.result.current.setAppsDrawerWidth(appsDrawerWidthSet)
    })

    // Assert the store's appsDrawerWidth was updated
    expect(storeHook.result.current.appsDrawerWidth).toBe(10)
  })
})
