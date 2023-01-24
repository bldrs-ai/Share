import React from 'react'
import {useAuth0} from '@auth0/auth0-react'


/** @return {React.Component} */
const LoginButton = () => {
  const {loginWithRedirect} = useAuth0()

  return <button onClick={() => loginWithRedirect()}>Log In</button>
}


/** @return {React.Component} */
const LogoutButton = () => {
  const {logout} = useAuth0()

  return (
    <button onClick={() => logout({logoutParams: {returnTo: window.location.origin}})}>
      Log Out
    </button>
  )
}


/** @return {React.Component} */
export default function AuthControl() {
  const {user, isAuthenticated, isLoading} = useAuth0()

  if (isLoading) {
    return <div>Loading ...</div>
  }

  return (
    isAuthenticated ? (
      <div>
        <img src={user.picture} alt={user.name} style={{width: '40px', height: '40px'}}/>
        <h2>{user.name}</h2>
        <p>{user.email}</p>
        <LogoutButton/>
      </div>
    ) : (
      <LoginButton/>
    )
  )
}
