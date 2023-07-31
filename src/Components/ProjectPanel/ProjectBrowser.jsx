import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Box from '@mui/material/Box'
import SearchBar from '../SearchBar'
import GitHubIcon from '@mui/icons-material/GitHub'
import LoginComponent from './LoginComponent'
import NavigateToRepository from './NavigateToRepository'
import ProjectAccessActions from './ProjectAccessActions'


const ProjectBrower = ({fileOpen}) => {
  const {isAuthenticated, loginWithRedirect} = useAuth0()
  const login = async () => {
    await loginWithRedirect({
      appState: {
        returnTo: window.location.pathname,
      },
    })
  }
  return (
    <Box
      sx={{
        'display': 'flex',
        'flexDirection': 'column',
        'justifyContent': 'flex-start',
        'alignItems': 'center',
        'width': '240px',
        'marginBottom': '14px',
        'marginTop': '10px',
        'overflow': 'auto',
        'scrollbarWidth': 'none', /* Firefox */
        '-ms-overflow-style': 'none', /* Internet Explorer 10+ */
        '&::-webkit-scrollbar': {
          width: '0em',
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'transparent',
        },
      }}
    >
      <Box
        sx={{
          width: '230px',
        }}
      >
        <SearchBar
          placeholderText={'Paste model link'}
          variableLength={false}
          icon={ <GitHubIcon style={{width: '20px', height: '20px', opacity: .5}}/>}
        />
      </Box>
      {!isAuthenticated &&
        <>
          <LoginComponent/>
          <ProjectAccessActions login={login} fileOpen={fileOpen}/>
        </>
      }
      {isAuthenticated &&
        <>
          <NavigateToRepository/>
          <ProjectAccessActions login={login} fileOpen={fileOpen}/>
        </>
      }
    </Box>
  )
}

export default ProjectBrower
