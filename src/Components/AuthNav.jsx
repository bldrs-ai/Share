import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import LoginButton from './LoginButton'
import UserProfile from './UserProfile'
import Loader from './Loader'
import {TooltipIconButton} from './Buttons'


const AuthNav = () => {
  const {isLoading, isAuthenticated} = useAuth0()

  if (isLoading) {
    return (
      <TooltipIconButton
        title={'Log in with GitHub'}
        icon={<Loader/>}
        onClick={() => {
          return undefined
        }}
      />
    )
  }
  return isAuthenticated ?
    <UserProfile/> :
    <LoginButton/>
}

export default AuthNav
