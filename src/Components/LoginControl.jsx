import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import {TooltipIconButton, TooltipLetterButton} from './Buttons'
import {makeStyles, useTheme} from '@mui/styles'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import PersonIcon from '../assets/2D_Icons/Person.svg'


/**
 * Login control to authorize with GitHub.
 * @return {Object} React component.
 */
export default function LoginControl() {
  const classes = useStyles(useTheme())
  return <div className={classes.root}><AvatarButton/></div>
}


// See https://auth0.com/docs/quickstart/spa/react#add-login-to-your-application

/**
 * @return {Object} React component.
 */
function AvatarButton() {
  const {
    isAuthenticated,
    isLoading,
    error,
    user,
    loginWithRedirect,
    logout,
  } = useAuth0()
  const classes = useStyles(useTheme())
  if (isLoading) {
    return (
      <div className={classes.loading}>
        <TooltipIconButton
          title='Loading...'
          icon={<AutorenewIcon/>}
          onClick={()=>{}}/>
      </div>
    )
  }
  if (error) {
    return <TooltipLetterButton fullString={'Error'} onClick={()=>{}}/>
  }
  if (isAuthenticated) {
    const name = user.nickname || user.name
    return (
      user.picture ?
        <TooltipIconButton
          title={name}
          icon={<img className={classes.picture} src={user.picture} alt={name}/>}
          onClick={() => logout({returnTo: window.location.origin + '/share'})}/> :
        <TooltipLetterButton
          fullString={name}
          onClick={() => logout({returnTo: window.location.origin + '/share'})}/>
    )
  } else {
    return (
      <TooltipIconButton
        title='Login'
        icon={<PersonIcon/>}
        onClick={loginWithRedirect}/>
    )
  }
}


const useStyles = makeStyles((theme) => ({
  'root': {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '30px',
    color: 'white',
  },
  'picture': {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: 'solid 1px #ccc',
  },
  // Not sure where this $spin syntax is defined.  Here's best ref I could find.
  // https://github.com/mui/material-ui/issues/13793#issuecomment-512202238
  'loading': {
    animation: '$spin 2s linear infinite',
  },
  '@keyframes spin': {
    from: {
      transform: 'rotate(0deg)',
    },
    to: {
      transform: 'rotate(360deg)',
    },
  },
}))
