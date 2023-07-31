import React, {useState, useEffect} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import TitleBar from './TitleBar'
import ProjectPanelOptions from './ProjectPanelOptions'
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
  const [showMode, setShowMode] = useState('sample')
  const {isAuthenticated} = useAuth0()
  useEffect(() => {
    if (isAuthenticated) {
      setShowMode('projects')
    }
  }, [isAuthenticated])

  return (
    <Paper
      elevation={1}
      variant='control'
      sx={{
        display: 'flex',
        width: '280px',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        borderRadius: '10px',
        opacity: .95,
      }}
    >
      <TitleBar showMode={showMode}/>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ProjectPanelOptions showMode={showMode} setShowMode={setShowMode}/>
        {showMode === 'sample' && <SampleProjects/>}
        {showMode === 'projects' && <ProjectBrower fileOpen={fileOpen}/>}
        {showMode === 'save' && <Version fileOpen={fileOpen}/>}
      </Box>
    </Paper>
  )
}
