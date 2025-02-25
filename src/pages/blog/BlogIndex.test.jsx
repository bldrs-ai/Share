import React from 'react'
import {render} from '@testing-library/react'
import MarkdownBlogPost from '../../Components/MarkdownBlogPost'
import {HelmetThemeCtx} from '../../Share.fixture'
import BlogIndex from './BlogIndex'
import Post20241205 from './Post20241205.md'


describe('BlogIndex and Posts', () => {
  it('renders', () => {
    const {getByText} = render(<BlogIndex/>, {wrapper: HelmetThemeCtx})
    const title = getByText('Blog Posts')
    expect(title).toBeInTheDocument()
    expect(getByText('Bldrs Announces Launch of Share and the Conway Engine')).toBeInTheDocument()
  })
  it('Posts render', () => {
    const {getByText} = render(
      <MarkdownBlogPost
        title='Bldrs Announces Launch of Share and the Conway Engine'
        dateline='dateline'
        markdownContent={Post20241205}
      />, {wrapper: HelmetThemeCtx})
    expect(getByText('Bldrs Announces Launch of Share and the Conway Engine')).toBeInTheDocument()
  })
})
