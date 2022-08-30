import React from 'react'


// https://github.com/auth0/auth0-react/issues/248
const Auth0Provider = ({children}) => <>{children}</>


const useAuth0 = () => ({
  getAccessTokenSilently: jest.fn(),
  isAuthenticated: true,
  isLoading: false,
  logout: jest.fn(),
  loginWithRedirect: jest.fn(),
  user: {
    name: 'John Doe',
    nickname: 'John',
    email: 'johndoe@me.com',
    email_verified: true,
    sub: 'google-oauth2|12345678901234',
  },
})


export {
  Auth0Provider,
  useAuth0,
}
