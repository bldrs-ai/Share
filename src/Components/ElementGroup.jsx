import React, {useState} from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import Stack from '@mui/material/Stack'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import CutPlaneMenu from './CutPlaneMenu'
import CloseIcon from '@mui/icons-material/Close'
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus'
import HideSourceOutlinedIcon from '@mui/icons-material/HideSourceOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function ElementGroup({deselectItems}) {
  const viewer = useStore((state) => state.viewer)
  const selectedElement = useStore((state) => state.selectedElement)
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
      sx={{
        position: 'fixed',
        bottom: '1.0em',
        width: '100%',
      }}
    >
      <ButtonGroup
        orientation='horizontal'
        variant='outlined'
        sx={{borderRadius: '10px', padding: '0px 10px'}}
      >
        {!isIsolate && <CutPlaneMenu/>}

        {isSelected() && selectedElement !== null &&
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
         />}

        {isHidden && !isIsolate &&
          <TooltipIconButton
            title='Show all'
            onClick={() => {
              viewer.isolator.unHideAllElements()
              setIsHidden(false)
            }}
            icon={<VisibilityOutlinedIcon className='icon-share'/>}
            placement='top'
            variant='solid'
          />}

        {isSelected() && !isIsolate &&
         <TooltipIconButton
           title='Hide'
           onClick={() => {
             viewer.isolator.hideSelectedElements()
             setIsHidden(true)
           }}
           icon={<HideSourceOutlinedIcon className='icon-share'/>}
           placement='top'
           variant='solid'
           selected={isIsolate}
         />}

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
