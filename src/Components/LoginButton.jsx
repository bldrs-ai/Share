import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import {TooltipIconButton} from './Buttons'
import PersonIcon from '../assets/icons/Person.svg'


const LoginButton = ({
  title = 'Log in with GitHub',
  placement = 'right',
  ...propss
}) => {
  const {loginWithRedirect} = useAuth0()

  const onClick = async () => {
    await loginWithRedirect({
      appState: {
        returnTo: window.location.pathname,
      },
    })
  }

  return (
    <TooltipIconButton
      title={'Log in with GitHub Account'}
      icon={<PersonIcon style={{width: '21px', height: '21px'}}/>}
      onClick={onClick}
    />
  )
}

export default LoginButton
