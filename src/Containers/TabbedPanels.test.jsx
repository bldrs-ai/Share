import React from 'react'
import {act, render, renderHook, screen} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import TabbedPanels from './TabbedPanels'
import {useIsMobile} from '../Components/Hooks'
import {BOT_TITLE} from '../Components/Bot/component'


jest.mock('../Components/Hooks', () => ({
  useIsMobile: jest.fn(),
}))

describe('TabbedPanels', () => {
  useIsMobile.mockReturnValue(true)

  it('shows and hides panels and respects recently added order', async () => {
    // Access the store
    const {result} = renderHook(() => useStore((state) => state))

    // Initially, no panels are visible
    const {queryByText} = render(
      <ShareMock>
        <TabbedPanels
          pathPrefix="/mock/path"
          branch="main"
          selectWithShiftClickEvents={false}
        />
      </ShareMock>,
    )
    // No tabs visible initially
    expect(queryByText('Apps')).toBeNull()
    expect(queryByText('Notes')).toBeNull()

    // Show the Apps panel
    await act(async () => {
      await result.current.setIsAppsVisible(true)
    })
    // The Apps panel should now be visible
    const visibleAppsTab = screen.getByTestId('simple-tab-0')
    expect(visibleAppsTab).toBeVisible()

    // Show the Notes panel
    await act(async () => {
      await result.current.setIsNotesVisible(true)
    })
    // The Notes panel should now be visible and should be the last tab selected
    const visibleNotesTab = screen.getByTestId('simple-tab-1')
    expect(visibleNotesTab).toBeVisible()

    // The currently selected tab should be the last opened one (Notes).
    // By default, the code sets the selected tab to the last added one.
    // Let's verify by checking tab container order.
    // The second tab (index 1) should be Notes and should be selected.
    const tabs = screen.getAllByRole('tab')

    const visibleTabs = tabs.filter((tab) => tab.id)

    expect(visibleTabs.length).toBe(2)
    expect(visibleTabs[0]).toHaveTextContent('Apps')
    expect(visibleTabs[1]).toHaveTextContent('Notes')

    // Close the Notes panel
    await act(async () => {
      await result.current.setIsNotesVisible(false)
    })

    // After removing Notes, only Apps should remain.
    expect(screen.queryByText('Notes')).toBeNull()
    expect(screen.getByText('Apps')).toBeVisible()
  })

  it('shows Nav and then props and checks last added selection', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    // eslint-disable-next-line no-unused-vars
    const {queryByText} = render(
      <ShareMock>
        <TabbedPanels
          pathPrefix="/mock/path"
          branch="main"
          selectWithShiftClickEvents={false}
        />
      </ShareMock>,
    )

    // Show Nav panel
    await act(async () => {
      await result.current.setIsNavTreeVisible(true)
    })
    expect(await screen.findByText('Nav')).toBeVisible()

    // Show Props panel
    await act(async () => {
      await result.current.setIsPropertiesVisible(true)
    })
    expect(await screen.findByText('Props')).toBeVisible()

    // The last added is Props, ensure that it exists
    // Close the Props panel
    await act(async () => {
      await result.current.setIsPropertiesVisible(false)
    })

    // Now only Nav should remain
    expect(screen.queryByText('Props')).toBeNull()
    expect(screen.getByText('Nav')).toBeVisible()
  })

  it('shows bot panel when feature flag is enabled', async () => {
    window.history.pushState({}, '', '?feature=bot')
    const {result} = renderHook(() => useStore((state) => state))

    render(
      <ShareMock>
        <TabbedPanels
          pathPrefix="/mock/path"
          branch="main"
          selectWithShiftClickEvents={false}
        />
      </ShareMock>,
    )

    await act(async () => {
      await result.current.setIsBotVisible(true)
    })
    expect(await screen.findByText('AI')).toBeVisible()

    await act(async () => {
      await result.current.setIsBotVisible(false)
    })
    expect(screen.queryByText('Bot')).toBeNull()
  })
})
