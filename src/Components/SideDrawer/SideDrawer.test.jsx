import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import useStore from '../../store/useStore'
import {ThemeCtx} from '../../theme/Theme.fixture'
import SideDrawer from './SideDrawer'


describe('SideDrawer', () => {
  it('renders', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedNoteId(null)
    })
    const {findByText} = render(
      <SideDrawer
        isDrawerVisible={true}
        drawerWidth={100}
        drawerWidthInitial={100}
        setDrawerWidth={jest.fn()}
      >
        NOTES
      </SideDrawer>,
      {wrapper: ThemeCtx})
    expect(await findByText('NOTES')).toBeVisible()
  })
})
