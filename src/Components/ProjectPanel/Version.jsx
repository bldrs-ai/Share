import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Box from '@mui/material/Box'
import {RectangularButton} from '../Buttons'
import ExportIcon from '../../assets/icons/Export.svg'
import CommitActionIcon from '../../assets/icons/CommitAction.svg'
import GitHubIcon from '@mui/icons-material/GitHub'
import SaveProject from './SaveProject'


const Version = ({fileOpen}) => {
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
        'borderRadius': '10px',
        'marginBottom': '14px',
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
      <SaveProject/>
      <Box sx={{
        height: '92px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: '6px',
      }}
      >
        {isAuthenticated ?
          <RectangularButton
            title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Save version</Box>}
            onClick={fileOpen}
            placement={'top'}
            icon={<CommitActionIcon style={{width: '28px', height: '18px'}}/>}
          /> :
          <RectangularButton
            title={'Login to GitHub'}
            onClick={login}
            icon={<GitHubIcon style={{opacity: .5}}/>}
          />
        }
        <RectangularButton
          title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Export ifc</Box>}
          onClick={fileOpen}
          placement={'top'}
          icon={<ExportIcon style={{width: '28px', height: '18px', paddingLeft: '6px'}}/>}
        />
      </Box>
    </Box>
  )
}

export default Version
