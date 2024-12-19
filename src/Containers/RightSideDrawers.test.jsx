import React from 'react'
import {render, renderHook, act} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import RightSideDrawers from './RightSideDrawers'
import {TITLE_NOTES} from '../Components/Notes/component'


describe('RightSideDrawers', () => {
  it('renders both Notes and Apps panels when visible', async () => {
    const storeHook = renderHook(() => useStore((state) => state))
    const rightDrawersRender = render(<ShareMock><RightSideDrawers/></ShareMock>)

    // Show Notes panel
    await act(() => {
      storeHook.result.current.setIsNotesVisible(true)
    })
    expect(await rightDrawersRender.findByText(TITLE_NOTES)).toBeVisible()

    // Show Apps panel
    await act(() => {
      storeHook.result.current.setIsAppsVisible(true)
    })
    expect(await rightDrawersRender.findByText('Apps')).toBeVisible()

    // Reset the store
    await act(() => {
      storeHook.result.current.setIsNotesVisible(false)
      storeHook.result.current.setIsAppsVisible(false)
    })
  })

  it('handles maximizing Notes panel and minimizing Apps panel', async () => {
    const storeHook = renderHook(() => useStore((state) => state))

    // Show both Notes and Apps panels
    await act(() => {
      storeHook.result.current.setIsNotesVisible(true)
      storeHook.result.current.setIsAppsVisible(true)
    })

    // eslint-disable-next-line no-unused-vars
    const rightDrawersRender = render(<ShareMock><RightSideDrawers/></ShareMock>)

    const initialAppsDrawerWidth = storeHook.result.current.appsDrawerWidth
    const initialNotesDrawerWidth = storeHook.result.current.rightDrawerWidth
    const availableWidth = 1200

    // Maximize Notes
    await act(() => {
      storeHook.result.current.setAppsDrawerWidth(10) // Mimic minimizing apps
      storeHook.result.current.setRightDrawerWidth(availableWidth - 10) // Mimic maximizing notes
    })

    expect(storeHook.result.current.appsDrawerWidth).toBe(10)
    expect(storeHook.result.current.rightDrawerWidth).toBe(availableWidth - 10) // Available width - 10

    // Reset to initial state
    await act(() => {
      storeHook.result.current.setAppsDrawerWidth(initialAppsDrawerWidth)
      storeHook.result.current.setRightDrawerWidth(initialNotesDrawerWidth)
    })
  })
})
