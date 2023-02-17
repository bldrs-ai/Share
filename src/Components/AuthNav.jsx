import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import LoginButton from './LoginButton'
import UserProfile from './UserProfile'
import LoopIcon from '@mui/icons-material/Loop'


const AuthNav = () => {
  const {isLoading, isAuthenticated} = useAuth0()

  if (isLoading) {
    return <LoopIcon/>
  }

  return isAuthenticated ?
    <UserProfile/> :
    <LoginButton/>
}

export default AuthNav
