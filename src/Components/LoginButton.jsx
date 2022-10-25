import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import {TooltipIconButton} from './Buttons'
import GitHubIcon from '@mui/icons-material/GitHub'


const LoginButton = ({
  title = 'Log in to GitHub',
  placement = 'right',
  ...props
}) => {
  const {loginWithRedirect} = useAuth0()

  return (
    <TooltipIconButton
      title={'Log in with Github'}
      icon={<GitHubIcon />}
      onClick={loginWithRedirect}
    />
  )
}

export default LoginButton
