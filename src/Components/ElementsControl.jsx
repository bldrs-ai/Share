import React, {ReactElement, useState} from 'react'
import {ButtonGroup, Stack} from '@mui/material'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import CutPlaneMenu from './CutPlane/CutPlaneMenu'
import {
  Close as CloseIcon,
  FilterCenterFocus as FilterCenterFocusIcon,
  HideSourceOutlined as HideSourceOutlinedIcon,
  VisibilityOutlined as VisibilityOutlinedIcon,
} from '@mui/icons-material'


/**
 * ElementsControl contains tools for controlling element visibility
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement} The rendered ElementsControl component.
 */
export default function ElementsControl({deselectItems}) {
  const viewer = useStore((state) => state.viewer)
  const selectedElement = useStore((state) => state.selectedElement)
  const [isIsolate, setIsIsolate] = useState(false)
  const [isHidden, setIsHidden] = useState(false)

  const isSelected = () => selectedElement !== null

  return (
    <Stack
      spacing={2}
      direction='row'
      justifyContent='center'
      alignItems='center'
      data-testid='element-group'
    >
      <ButtonGroup orientation='horizontal' variant='controls'>
        {/* -------- Recenter Button --------------------------------------- */}
        <TooltipIconButton
          title='Recenter'
          onClick={() => {
            viewer.context.fitToFrame()
          }}
          icon={<FilterCenterFocusIcon className='icon-share'/>}
          placement='top'
          variant='solid'
        />
        {/* ---------------------------------------------------------------- */}

        {!isIsolate && <CutPlaneMenu/>}

        {isSelected() && (
          <TooltipIconButton
            title='Isolate'
            onClick={() => {
              viewer.isolator.toggleIsolationMode()
              setIsIsolate(!isIsolate)
            }}
            icon={<FilterCenterFocusIcon className='icon-share'/>}
            placement='top'
            variant='solid'
            selected={isIsolate}
          />
        )}

        {isHidden && !isIsolate && (
          <TooltipIconButton
            title='Show all'
            onClick={() => {
              viewer.isolator.unHideAllElements()
              setIsHidden(false)
            }}
            icon={<VisibilityOutlinedIcon className='icon-share'/>}
            placement='top'
            variant='solid'
          />
        )}

        {isSelected() && !isIsolate && (
          <TooltipIconButton
            title='Hide'
            onClick={() => {
              viewer.isolator.hideSelectedElements()
              setIsHidden(true)
            }}
            icon={<HideSourceOutlinedIcon className='icon-share'/>}
            placement='top'
            variant='solid'
          />
        )}

        {isSelected() && !isIsolate &&
         <TooltipIconButton
           title='Clear'
           onClick={deselectItems}
           icon={<CloseIcon className='icon-share'/>}
           placement='top'
           variant='solid'
         />}
      </ButtonGroup>
    </Stack>
  )
}
