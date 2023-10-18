import React, {useState} from 'react'
import Stack from '@mui/material/Stack'
import ButtonGroup from '@mui/material/ButtonGroup'
import useTheme from '@mui/styles/useTheme'
import useStore from '../store/useStore'
import CameraControl from './CameraControl'
import CutPlaneMenu from './CutPlaneMenu'
import {TooltipIconButton} from './Buttons'
import CenterFocusWeakIcon from '@mui/icons-material/CenterFocusWeak'
import HighlightOffIcon from '@mui/icons-material/HighlightOff'
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined'
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'
import HistoryIcon from '@mui/icons-material/History'
import TreeIcon from '../assets/icons/Tree.svg'

/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function MiscGroup({deselectItems, viewer, repo}) {
  const cutPlanes = useStore((state) => state.cutPlanes)
  const levelInstance = useStore((state) => state.levelInstance)
  const selectedElement = useStore((state) => state.selectedElement)
  const isModelInteractionGroupVisible = useStore((state) => state.isModelInteractionGroupVisible)
  const isSettingsVisible = useStore((state) => state.isSettingsVisible)
  const [isolate, setIsolate] = useState(false)
  const isVersionHistoryVisible = useStore((state) => state.isVersionHistoryVisible)
  const toggleIsVersionHistoryVisible = useStore((state) => state.toggleIsVersionHistoryVisible)
  const isNavigationVisible = useStore((state) => state.isNavigationVisible)
  const toggleIsNavigationVisible = useStore((state) => state.toggleIsNavigationVisible)


  const isSelected = () => {
    const ifSelected = (
      selectedElement !== null ||
      cutPlanes.length !== 0 ||
      levelInstance !== null
    )
    return ifSelected
  }

  const theme = useTheme()
  return (
    <Stack
      spacing={2}
      direction="row"
      justifyContent="center"
      alignItems="center"
    >
      <ButtonGroup
        orientation='horizontal'
        variant='outlined'
        sx={{borderRadius: '20px', padding: '0px 20px'}}
      >

        {isSettingsVisible &&
          <>
            <TooltipIconButton
              title='Navigation'
              icon={<TreeIcon className='icon-share' color='secondary' style={{width: '17px', height: '17px'}}/>}
              placement='top'
              dataTestId='Navigation'
              aboutInfo={false}
              selected={isNavigationVisible}
              onClick={() => {
                if (isVersionHistoryVisible) {
                  toggleIsVersionHistoryVisible()
                  toggleIsNavigationVisible()
                } else {
                  toggleIsNavigationVisible()
                }
              }}
            />
            {repo !== undefined &&
              <TooltipIconButton
                title='Project History'
                icon={<HistoryIcon className='icon-share' color='secondary'/>}
                placement='top'
                selected={isVersionHistoryVisible}
                onClick={() => {
                  if (isNavigationVisible) {
                    toggleIsVersionHistoryVisible()
                    toggleIsNavigationVisible()
                  } else {
                    toggleIsVersionHistoryVisible()
                  }
                }}
              />
            }
            <TooltipIconButton
              title={`${theme.palette.mode === 'light' ? 'Day' : 'Night'} theme`}
              onClick={() => theme.toggleColorMode()}
              placement={'top'}
              icon={
                theme.palette.mode === 'light' ?
                  <WbSunnyOutlinedIcon className='icon-share' color='secondary'/> :
                  <NightlightOutlinedIcon className='icon-share'/> }
            />
          </>
        }
        {isModelInteractionGroupVisible &&
          <>
            <CutPlaneMenu/>
          </>
        }
        {isSelected() &&
        <>
          {selectedElement !== null &&
              <TooltipIconButton
                showTitle={true}
                title='Isolate'
                placement='top'
                onClick={() => {
                  viewer.isolator.toggleIsolationMode()
                  setIsolate(!isolate)
                }}
                selected={isolate}
                icon={<CenterFocusWeakIcon/>}
              />
          }
          <TooltipIconButton
            title='Clear'
            placement='top'
            onClick={() => {
              if (isolate) {
                setIsolate(!isolate)
                viewer.isolator.toggleIsolationMode()
              }
              deselectItems()
            }}
            selected={isSelected()}
            icon={<HighlightOffIcon className='icon-share'color='secondary'/>}
          />
        </>
        }
        {/* Invisible */}
        <CameraControl/>
      </ButtonGroup >
    </Stack>
  )
}
