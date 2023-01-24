import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'


/** @return {React.Component} */
export default function AuthControl() {
  const {user, isAuthenticated, isLoading, loginWithRedirect, logout} = useAuth0()


  if (isLoading) {
    return <div>Loading ...</div>
  }

  return isAuthenticated ? (
    <Avatar
      alt={user.name}
      src={user.picture} variant='circular'
      onClick={() => logout({logoutParams: {returnTo: window.location.origin}})}
      sx={{
        width: '30px',
        height: '30px',
        margin: '1em 0 10px 5px',
      }}
    />
  ) : (
    <button onClick={() => loginWithRedirect()}>Log In</button>
  )
}
