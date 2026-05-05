import React from 'react'
import {render, screen} from '@testing-library/react'
import {RouteThemeCtx} from '../../Share.fixture'
import GitHubFileBrowser from './GitHubFileBrowser'


jest.mock('../../net/github/Organizations', () => ({
  getOrganizations: jest.fn().mockResolvedValue({}),
}))


describe('GitHubFileBrowser', () => {
  const navigate = jest.fn()

  it('renders all the UI elements', () => {
    render(
      <GitHubFileBrowser navigate={navigate}/>,
      {wrapper: RouteThemeCtx},
    )
    expect(screen.getByText(/Browse files on Github/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Organization/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Repository/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Branch/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Folder/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/File/i)).toBeInTheDocument()
  })
})
