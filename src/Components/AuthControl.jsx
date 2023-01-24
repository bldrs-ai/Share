import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import GitHubIcon from '../assets/2D_Icons/GitHub.svg'


const Login = () => {
  const {loginWithRedirect} = useAuth0()
  return (
    <Avatar
      variant='circular'
      onClick={() => loginWithRedirect()}
    >
      <GitHubIcon/>
    </Avatar>
  )
}


const Logout = () => {
  const {user, logout} = useAuth0()
  return (
    <Avatar
      alt={user.name}
      src={user.picture}
      variant='circular'
      onClick={() => logout({logoutParams: {returnTo: window.location.origin}})}
    />
  )
}


/** @return {React.Component} */
export default function AuthControl() {
  const {user, isAuthenticated, isLoading, loginWithRedirect, logout} = useAuth0()
  return (
    <Box
      sx={{
        'width': '30px',
        'height': '30px',
        'margin': '1em 0',
        'cursor': 'pointer',
        '& svg': {
          width: '30px',
          height: '30px',
        },
      }}
    >
      {
        isLoading ? (
          <Avatar variant='circular'>🎱</Avatar>
        ) : (
          isAuthenticated ? (
            <Logout user={user} logout={logout}/>
          ) : (
            <Login user={user} loginWithRedirect={loginWithRedirect}/>
          )
        )
      }
    </Box>
  )
}
