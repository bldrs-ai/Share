import React from 'react'
import {render} from '@testing-library/react'
import {ThemeCtx} from '../../theme/Theme.fixture'
import SideDrawer from './SideDrawer'


describe('SideDrawer', () => {
  it('renders', async () => {
    const {findByText} = render(<SideDrawer isDrawerOpen={true}>NOTES</SideDrawer>, {wrapper: ThemeCtx})
    expect(await findByText('NOTES')).toBeVisible()
  })
})
