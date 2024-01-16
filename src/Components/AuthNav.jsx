import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import LoginButton from './LoginButton'
import UserProfile from './UserProfile'
import Loader from './Loader'


/** @return {React.Component} */
export default function AuthNav() {
  const {isLoading, isAuthenticated} = useAuth0()
  if (isLoading) {
    return <Loader className='icon-share'/>
  }
  return isAuthenticated ?
    <UserProfile/> :
    <LoginButton/>
}
