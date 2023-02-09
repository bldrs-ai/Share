import React from 'react'
import {render, screen} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import AuthNav from './AuthNav'


describe('AuthNav', () => {
  it('renders the login button when not logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)

    render(<AuthNav/>)
    const loginButton = await screen.findByTitle(/Log in with GitHub/i)
    expect(loginButton).toBeInTheDocument()
  })

  it('renders the user avatar when logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

    render(<AuthNav/>)
    const avatarImage = await screen.findByAltText(/Unit Testing/i)
    expect(avatarImage).toBeInTheDocument()
  })
})
