import React from 'react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import {RectangularButton} from './Buttons'
import CaptureIcon from '../assets/icons/Capture.svg'
import useStore from '../store/useStore'
import {
  addCameraUrlParams,
  // removeCameraUrlParams,
} from './CameraControl'
import useTheme from '@mui/styles/useTheme'
import SavedView from '../assets/icons/view/SavedView.svg'


/**
 * Controls group contains toggles for fileapth, branches, spatial navigation, and element type navigation
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function Panel() {
  const cameraControls = useStore((state) => state.cameraControls)
  const setSavedViews = useStore((state) => state.setSavedViews)
  const savedViews = useStore((state) => state.savedViews)
  const theme = useTheme()

  const onCapture = () => {
    addCameraUrlParams(cameraControls)
    const url = window.location.href
    const viewUrls = savedViews.concat(url)
    setSavedViews(viewUrls)
  }

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
        opacity: .9,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          height: '60px',
          opacity: .9,
          fontWeight: '500',
          borderBottom: `1px solid ${theme.palette.background.button}`,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: '10px',
          }}
        >
          <SavedView/>
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          Captured Views
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
        }}
      >
        <Box
          sx={{
            'display': 'flex',
            'flexDirection': 'column',
            'justifyContent': 'flex-start',
            'alignItems': 'center',
            'height': '160px',
            'width': '240px',
            'borderRadius': '5px',
            'backgroundColor': theme.palette.background.button,
            'marginTop': '20px',
            'marginBottom': '20px',
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
          {savedViews.reverse().map((viewUrl, i) => {
            return (
              <Box
                key={i}
                // sx={{
                // }}
              >
                <RectangularButton
                  title={`View ${i + 1}`}
                  placement={'left'}
                  onClick={() => {
                    window.location.replace(viewUrl)
                    // viewer.IFC.context.ifcCamera.cameraControls.setPosition(100, 0, 100, true)
                  }}
                  icon={<SavedView style={{width: '18px', height: '30px'}}/>}
                />
              </Box>
            )
          })}
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          marginBottom: '20px',
        }}
      >
        <RectangularButton
          title={'Capture View'}
          onClick={() => {
            onCapture()
          }}
          icon={<CaptureIcon/>}
        />
      </Box>
    </Paper>
  )
}
