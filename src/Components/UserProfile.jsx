import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import {Avatar} from '@material-ui/core'


const UserProfile = ({size = 'medium'}) => {
  const {user, isAuthenticated} = useAuth0()

  return isAuthenticated && (
    <Avatar alt={user.name} src={user.picture} />
  )
}

export default UserProfile
