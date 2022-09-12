import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import {CircularProgress} from '@material-ui/core'
import LoginButton from './LoginButton'
import UserProfile from './UserProfile'


const AuthNav = () => {
  const {isLoading, isAuthenticated} = useAuth0()

  if (isLoading) {
    return <CircularProgress />
  }

  return isAuthenticated ?
    <UserProfile /> :
    <LoginButton />
}

export default AuthNav
