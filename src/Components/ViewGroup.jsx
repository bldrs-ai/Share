import React from 'react'
import Paper from '@mui/material/Paper'
import {TooltipIconButton} from './Buttons'
import CutPlaneMenu from './CutPlaneMenu'
import useStore from '../store/useStore'
import StandardViewsMenu from './StandardViewsMenu'
import CaptureIcon from '../assets/icons/view/SavedView.svg'
import {useAuth0} from '@auth0/auth0-react'


/**
 * View group contains actions related to viewing the model, such as sections, saved and standard views
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function ViewGroup({modelPath, isLocalModel, fileOpen}) {
  const showProjectPanel = useStore((state) => state.showProjectPanel)
  const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const toggleShowViewsPanel = useStore((state) => state.toggleShowViewsPanel)
  const showViewsPanel = useStore((state) => state.showViewsPanel)
  const {isAuthenticated} = useAuth0()
  const hideNavPanel = useStore((state) => state.hideNavPanel)

  return (
    <Paper
      elevation={1}
      variant='control'
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        marginLeft: '5px',
        borderRadius: '10px',
        opacity: .9,
      }}
    >
      <StandardViewsMenu/>
      <CutPlaneMenu/>
      {isAuthenticated &&
        <TooltipIconButton
          title={'Capture views'}
          placement={'top'}
          icon={<CaptureIcon/>}
          selected={showViewsPanel}
          onClick={() => {
            toggleShowViewsPanel()
            hideNavPanel()
            if (showProjectPanel) {
              toggleShowProjectPanel()
            }
          }}
        />
      }
    </Paper>
  )
}
