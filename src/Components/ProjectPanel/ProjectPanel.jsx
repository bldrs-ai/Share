import React, {useEffect} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import useStore from '../../store/useStore'
import ProjectPanelTabs from './ProjectPanelTabs'
import SampleProjects from './SampleProjects'
import ProjectBrower from './ProjectBrowser'
import Version from './Version'

/**
 * Controls group contains toggles for fileapth, branches, spatial navigation, and element type navigation
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function ProjectPanel({fileOpen, modelPathDefined, isLocalModel}) {
  const projectMode = useStore((state) => state.projectMode)
  const {isAuthenticated} = useAuth0()
  useEffect(() => {
    if (isAuthenticated) {
      projectMode('Open project')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  return (
    <Paper
      // elevation={1}
      variant='control'
      sx={{
        display: 'flex',
        width: '280px',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        borderRadius: '10px',
        opacity: .95,
        boxShadow: 'none',
      }}
    >
      {/* <TitleBar showMode={showMode}/> */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ProjectPanelTabs/>
        {projectMode === 'Sample projects' && <SampleProjects/>}
        {projectMode === 'Open project' && <ProjectBrower fileOpen={fileOpen}/>}
        {projectMode === 'Save project' && <Version fileOpen={fileOpen}/>}
      </Box>
    </Paper>
  )
}
