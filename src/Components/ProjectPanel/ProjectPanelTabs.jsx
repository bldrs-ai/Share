import React from 'react'
// import {useAuth0} from '@auth0/auth0-react'
import Box from '@mui/material/Box'
import {styled} from '@mui/material/styles'
import useStore from '../../store/useStore'
// import useTheme from '@mui/styles/useTheme'
// import Sheenstock from '../../assets/icons/projects/Sheenstock.svg'
// import SaveIcon from '../../assets/icons/Save.svg'
// import OpenIcon from '../../assets/icons/OpenFolder.svg'
// import FolderIcon from '../../assets/icons/Folder.svg'
// import {TooltipIconButton} from '../Buttons'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'


const AntTab = styled((props) => <Tab disableRipple {...props}/>)(({theme}) => ({
  'textTransform': 'none',
  'fontWeight': 500,
  '@media (max-width: 900px)': {
    fontSize: '.5em',
  },
  'minWidth': 0,
  [theme.breakpoints.up('sm')]: {
    minWidth: 0,
  },
  'marginRight': theme.spacing(1),
  'color': theme.palette.primary.contrastText,
  '&:hover': {
    color: theme.palette.secondary.background,
    opacity: 1,
  },
  '&.Mui-selected': {
    color: theme.palette.secondary.main,
  },
  '&.Mui-focusVisible': {
    backgroundColor: '#d1eaff',
  },
}))


const ProjectPanelTabs = () => {
  // const {isAuthenticated} = useAuth0()
  const [value, setValue] = React.useState(0)
  const setProjectMode = useStore((state) => state.setProjectMode)

  const handleChange = (event, newValue) => {
    setValue(newValue)
  }

  // const theme = useTheme()
  return (
    <Box
      sx={{
        'display': 'flex',
        'flexDirection': 'row',
        'justifyContent': 'center',
        'alignItems': 'center',
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
      <Tabs value={value} onChange={handleChange} centered fullWidth >
        <AntTab label="Explore"
          textColor="inherit"
          variant="fullWidth"
          onClick={() => {
            setProjectMode('Sample projects')
          }}
        />
        <AntTab label="Open"
          onClick={() => setProjectMode('Open project')}
        />
        <AntTab label="Save"
          onClick={() => setProjectMode('Save project')}
        />
      </Tabs>
      {/* <TooltipIconButton
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
      /> */}
    </Box>
  )
}

export default ProjectPanelTabs
