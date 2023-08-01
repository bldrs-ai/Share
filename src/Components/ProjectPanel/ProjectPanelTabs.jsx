import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
// import useTheme from '@mui/styles/useTheme'
import Box from '@mui/material/Box'
import Sheenstock from '../../assets/icons/projects/Sheenstock.svg'
import SaveIcon from '../../assets/icons/Save.svg'
import OpenIcon from '../../assets/icons/OpenFolder.svg'
import FolderIcon from '../../assets/icons/Folder.svg'
import {TooltipIconButton} from '../Buttons'


const ProjectPanelTabs = ({showMode, setShowMode}) => {
  const {isAuthenticated} = useAuth0()
  // const theme = useTheme()
  return (
    <Box
      sx={{
        'display': 'flex',
        'flexDirection': 'row',
        'justifyContent': 'center',
        // 'width': '186px',
        'alignItems': 'center',
        'borderRadius': '10px',
        'overflow': 'auto',
        // 'border': `1px solid ${theme.palette.primary.main}`,
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
      <TooltipIconButton
        title={'Partner Projects - Swiss Property'}
        onClick={() => setShowMode('sample')}
        selected={showMode === 'sample'}
        placement={'top'}
        icon={<Sheenstock style={{width: '22px', height: '22px'}}/>}
      />

      {!isAuthenticated &&
      <TooltipIconButton
        title={'Acceess projects hosted on GitHub'}
        placement={'top'}
        selected={showMode === 'projects'}
        onClick={() => setShowMode('projects')}
        icon={<FolderIcon style={{width: '21px', height: '21px'}}/>}
      />
      }

      {isAuthenticated &&
      <TooltipIconButton
        title={'Project Access'}
        placement={'top'}
        selected={showMode === 'projects'}
        onClick={() => setShowMode('projects')}
        icon={<OpenIcon style={{width: '20px', height: '20px'}}/>}
      />}

      <TooltipIconButton
        title={'Save Project'}
        placement={'top'}
        selected={showMode === 'save'}
        onClick={() => setShowMode('save')}
        icon={<SaveIcon style={{width: '20px', height: '20px'}}/>}
      />
    </Box>
  )
}

export default ProjectPanelTabs
