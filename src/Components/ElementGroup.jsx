import React, {useState} from 'react'
import Stack from '@mui/material/Stack'
import ButtonGroup from '@mui/material/ButtonGroup'
import useStore from '../store/useStore'
import CutPlaneMenu from './CutPlaneMenu'
import {TooltipIconButton} from './Buttons'
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import CloseIcon from '@mui/icons-material/Close'
import HideSourceOutlinedIcon from '@mui/icons-material/HideSourceOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function ElementGroup({deselectItems, viewer}) {
  const selectedElement = useStore((state) => state.selectedElement)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const turnOffIsHelpTooltips = useStore((state) => state.turnOffIsHelpTooltips)
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
        variant='contained'
      >
        {!isIsolate &&
          <>
            <CutPlaneMenu/>
          </>
        }
        {isSelected() && selectedElement !== null &&
              <TooltipIconButton
                title='Properties'
                onClick={() => {
                  turnOffIsHelpTooltips()
                  toggleIsPropertiesOn()
                  openDrawer()
                }}
                selected={isPropertiesOn}
                variant='solid'
                placement='top'
                icon={<InfoOutlinedIcon className='icon-share' color='secondary'/>}
              />
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
            title='Show all'
            placement='top'
            variant='solid'
            onClick={() => {
              viewer.isolator.unHideAllElements()
              setIsHidden(false)
            }}
            icon={<VisibilityOutlinedIcon className='icon-share'/>}
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
              icon={<HideSourceOutlinedIcon color='primary'/>}
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
      </ButtonGroup >
    </Stack>
  )
}
