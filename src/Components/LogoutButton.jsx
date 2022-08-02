import {useAuth0} from '@auth0/auth0-react'
import React from 'react'


/**
 * @return {Object} react component
 */
export default function LogoutButton() {
  const {logout} = useAuth0()

  return (
    <button onClick={() => logout({returnTo: window.location.origin})}>
      Log Out
    </button>
  )
}
