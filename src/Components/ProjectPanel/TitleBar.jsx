/* eslint-disable no-magic-numbers */
import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useStore from '../../store/useStore'
import useTheme from '@mui/styles/useTheme'
import DeleteIcon from '../../assets/icons/Delete.svg'
import ViewCube1 from '../../assets/icons/view/ViewCube1.svg'
import ViewCube2 from '../../assets/icons/view/ViewCube2.svg'
import ViewCube3 from '../../assets/icons/view/ViewCube3.svg'


const TitleBar = ({showMode}) => {
  const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const theme = useTheme()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0px 20px',
        height: '60px',
        fontWeight: '500',
        borderBottom: `1px solid ${theme.palette.background.button}`,
      }}
    >
      <Box
        sx={{
          width: '240px',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: '12px',
            paddingBottom: '2px',
          }}
        >
          {showMode === 'sample' && <ViewCube1/> }
          {showMode === 'projects' && <ViewCube2/> }
          {showMode === 'save' && <ViewCube3/> }

        </Box>
        <Typography variant='h4'
          sx={{
            fontWeight: '500',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {showMode === 'sample' && 'Sample projects' }
          {showMode === 'projects' && 'Access project' }
          {showMode === 'save' && 'Save project' }
        </Typography>
      </Box>
      <Box
        onClick={toggleShowProjectPanel}
      >
        <DeleteIcon style={{width: '12px', height: '12px'}}/>
      </Box>
    </Box>
  )
}

export default TitleBar
