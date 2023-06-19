/* eslint-disable max-len */
/* eslint-disable no-magic-numbers */
import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {RectangularButton} from './Buttons'
import CaptureIcon from '../assets/icons/Capture.svg'
import useStore from '../store/useStore'
import {
  addCameraUrlParams,
} from './CameraControl'
import useTheme from '@mui/styles/useTheme'
import SavedView from '../assets/icons/view/ViewCube2.svg'
import ViewCube1 from '../assets/icons/view/ViewCube1.svg'
import ViewCube2 from '../assets/icons/view/ViewCube2.svg'
import ViewCube3 from '../assets/icons/view/ViewCube3.svg'
import DeleteIcon from '../assets/icons/Delete.svg'
import PublishIcon from '../assets/icons/Publish.svg'


const icon = (iconNumber) => {
  if (iconNumber === 1) {
    return <ViewCube1 style={{width: '18px', height: '18px'}}/>
  }
  if (iconNumber === 2) {
    return <ViewCube2 style={{width: '18px', height: '18px'}}/>
  }
  if (iconNumber === 3) {
    return <ViewCube3 style={{width: '18px', height: '18px'}}/>
  }
}

const RectangleComponent = ({title, onClick, onDelete, selected}) => {
  const [isHovered, setIsHovered] = useState(false)
  const [isClicked, setIsClicked] = useState(false)
  const theme = useTheme()

  const handleMouseEnter = () => {
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
  }

  const handleClick = () => {
    setIsClicked(!isClicked)
    onClick()
  }

  const titleStyle = {
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'space-between',
    'cursor': 'pointer',
    'color': selected ? `${theme.palette.secondary.main}` : isHovered ? `${theme.palette.secondary.main}` : `${theme.palette.primary.contrastText}`,
    '@media (max-width: 900px)': {
      color: selected ? `${theme.palette.secondary.main}` : `${theme.palette.primary.contrastText}`,
      bottom: '80px',
      width: '256px',
      inlineSize: '256px',
      overflow: 'visible',
      overflowWrap: 'anywhere',
    },
  }

  return (
    <div
      style={{
        width: '220px',
        height: '30px',
        paddingBottom: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px',
      }}
    >
      <Box
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={titleStyle}
      >
        {selected ?
          <ViewCube1 style={{width: '12px', height: '12px'}}/> :
          <ViewCube2 style={{width: '12px', height: '12px'}}/>
        }

        <Box
          sx={{
            marginLeft: '12px',
          }}
        >
          {title}
        </Box>
      </Box>
      <Box sx={{display: 'flex', width: '34px', justifyContent: 'space-between'}}>
        <Box>
          <PublishIcon style={{width: '12px', height: '12px'}}/>
        </Box>
        <Box
          onClick={onDelete}
          sx={{cursor: 'pointer'}}
        >
          <DeleteIcon style={{width: '12px', height: '12px'}}/>
        </Box>
      </Box>
    </div>
  )
}


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
  const toggleShowViewsPanel = useStore((state) => state.toggleShowViewsPanel)
  const theme = useTheme()
  const [iconNumber, setIconNumber] = useState(1)
  const iconNumberCalc = iconNumber < 3 ? iconNumber + 1 : 1
  const [selected, setSelected] = useState('')

  const onCapture = () => {
    addCameraUrlParams(cameraControls)
    const url = window.location.href
    const viewUrls = savedViews.concat(url)
    setSavedViews(viewUrls)
  }

  const deleteView = (index) => {
    const updatedViews = [...savedViews]
    updatedViews.splice(index, 1)
    setSavedViews(updatedViews)
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
        opacity: .95,
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
        <Typography variant='h4'
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          Captured Views
        </Typography>
        <Box
          sx={{
            position: 'relative',
            left: '40px',
            cursor: 'pointer',
          }}
          onClick={toggleShowViewsPanel}
        >
          <DeleteIcon style={{width: '12px', height: '12px'}}/>
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
              >
                <RectangleComponent
                  title={`View ${i + 1}`}
                  placement={'left'}
                  selected={i === selected}
                  onDelete={() => {
                    setSelected('')
                    deleteView(i)
                  }} // Call deleteView method with index as parameter
                  onClick={() => {
                    window.location.replace(viewUrl)
                    setSelected(i)
                  }}
                  icon={icon(iconNumber)}
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
            setIconNumber(iconNumberCalc)
          }}
          icon={<CaptureIcon style={{width: '12px', height: '12px'}}/>}
        />
      </Box>
    </Paper>
  )
}
