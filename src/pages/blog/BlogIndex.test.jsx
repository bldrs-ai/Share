import React from 'react'
import {render} from '@testing-library/react'
import {HelmetThemeCtx} from '../../Share.fixture'
import BlogIndex from './BlogIndex'
import Post20241205BldrsAnnouncesLaunchOfShareAndTheConwayEngine from
    './Post20241205BldrsAnnouncesLaunchOfShareAndTheConwayEngine'


describe('BlogIndex and Posts', () => {
  it('renders', () => {
    const {getByText} = render(<BlogIndex/>, {wrapper: HelmetThemeCtx})
    const title = getByText('Blog Posts')
    expect(title).toBeInTheDocument()
    expect(getByText('Bldrs Announces Launch of Share and the Conway Engine')).toBeInTheDocument()
  })
  it('Posts render', () => {
    const {getByText} = render(<Post20241205BldrsAnnouncesLaunchOfShareAndTheConwayEngine/>, {wrapper: HelmetThemeCtx})
    expect(getByText('Bldrs Announces Launch of Share and the Conway Engine')).toBeInTheDocument()
  })
})
