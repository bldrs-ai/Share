import React from 'react'
import {render, screen} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import AuthNav from './AuthNav'


describe('AuthNav', () => {
  it('renders the login button when not logged in', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)

    render(<AuthNav/>)
    const loginButton = screen.getByTitle(/Log in with GitHub/i)
    expect(loginButton).toBeInTheDocument()
  })

  it('renders the user avatar when logged in', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

    render(<AuthNav/>)
    const avatarImage = screen.getByAltText(/Unit Testing/i)
    expect(avatarImage).toBeInTheDocument()
  })
})
