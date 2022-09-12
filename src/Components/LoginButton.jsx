import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import {TooltipIconButton} from './Buttons'
import LoginIcon from '@mui/icons-material/Login'


const LoginButton = ({
  title = 'Log in to Github',
  placement = 'right',
  ...props
}) => {
  const {loginWithRedirect} = useAuth0()
  return (
    <TooltipIconButton
      title={'Log in to Github'}
      icon={<LoginIcon/>}
      onClick={loginWithRedirect}
    />
  )
}

export default LoginButton
