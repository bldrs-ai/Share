import React from 'react'
import {render, screen} from '@testing-library/react'
import GitHubFileBrowser from './GitHubFileBrowser'


describe('GitHubFileBrowser', () => {
  const orgNamesArr = ['org1', 'org2']
  const user = {nickname: 'cypressTester'}
  const navigate = jest.fn()

  it('renders all the UI elements', () => {
    render(<GitHubFileBrowser navigate={navigate} orgNamesArr={orgNamesArr} user={user}/>)
    expect(screen.getByText(/Open file from Github/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Organization/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Repository/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Folder/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/File/i)).toBeInTheDocument()
  })
})
