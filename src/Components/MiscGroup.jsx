import React, {useState} from 'react'
import Stack from '@mui/material/Stack'
import ButtonGroup from '@mui/material/ButtonGroup'
import useStore from '../store/useStore'
import CameraControl from './CameraControl'
import CutPlaneMenu from './CutPlaneMenu'
import {TooltipIconButton} from './Buttons'
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus'
import CloseIcon from '@mui/icons-material/Close'
import HideIcon from '../assets/icons/Hide.svg'
import ShowIcon from '../assets/icons/ShowAll.svg'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function MiscGroup({deselectItems, viewer, repo}) {
  const selectedElement = useStore((state) => state.selectedElement)
  const isModelInteractionGroupVisible = useStore((state) => state.isModelInteractionGroupVisible)
  const [isIsolate, setIsIsolate] = useState(false)
  const [isHidden, setIsHidden] = useState(false)

  const isSelected = () => {
    const ifSelected = (
      selectedElement !== null
    )
    return ifSelected
  }


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
        {isModelInteractionGroupVisible && !isIsolate &&
          <>
            <CutPlaneMenu/>
          </>
        }
        {isSelected() && selectedElement !== null &&
            <TooltipIconButton
              showTitle={true}
              title='Isolate'
              placement='top'
              variant='solid'
              onClick={() => {
                viewer.isolator.toggleIsolationMode()
                setIsIsolate(!isIsolate)
              }}
              selected={isIsolate}
              icon={<FilterCenterFocusIcon color='secondary'/>}
            />}

        {isHidden && !isIsolate &&
          <TooltipIconButton
            title='Un-hide all'
            placement='top'
            variant='solid'
            onClick={() => {
              viewer.isolator.unHideAllElements()
              setIsHidden(false)
            }}
            icon={<ShowIcon className='icon-share'/>}
          />
        }
        {isSelected() && !isIsolate &&
            <TooltipIconButton
              showTitle={true}
              title='Hide'
              placement='top'
              variant='solid'
              onClick={() => {
                viewer.isolator.hideSelectedElements()
                setIsHidden(true)
              }}
              selected={isIsolate}
              icon={<HideIcon className='icon-share'/>}
            />
        }
        {isSelected() && !isIsolate &&
            <TooltipIconButton
              title='Clear'
              placement='top'
              variant='solid'
              onClick={() => {
                deselectItems()
              }}
              icon={<CloseIcon className='icon-share'color='secondary'/>}
            />
        }
        {/* Invisible */}
        <CameraControl/>
      </ButtonGroup >
    </Stack>
  )
}
