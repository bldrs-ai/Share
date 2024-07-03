import React, {ReactElement, useEffect, useState} from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState, TooltipIconButton} from '../Buttons'
import Dialog from '../Dialog'
import {HASH_PREFIX_HELP} from './hashState'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import CloseIcon from '@mui/icons-material/Close'
import CropOutlinedIcon from '@mui/icons-material/CropOutlined'
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import HideSourceOutlinedIcon from '@mui/icons-material/HideSourceOutlined'
import HistoryIcon from '@mui/icons-material/History'
import PortraitIcon from '@mui/icons-material/Portrait'
import SearchIcon from '@mui/icons-material/Search'
import ShiftIcon from '@mui/icons-material/FileUpload'
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import TreeIcon from '../../assets/icons/Tree.svg'
import ShareIcon from '../../assets/icons/Share.svg'


/**
 * ControlButton that toggles HelpDialog, with nav state
 *
 * @return {ReactElement}
 */
export default function HelpControl() {
  const isHelpVisible = useStore((state) => state.isHelpVisible)
  const setIsHelpVisible = useStore((state) => state.setIsHelpVisible)
  const setIsHelpTooltipsVisible = useStore((state) => state.setIsHelpTooltipsVisible)

  useEffect(() => {
    setIsHelpTooltipsVisible(isHelpVisible)
  }, [isHelpVisible, setIsHelpTooltipsVisible])

  return (
    <ControlButtonWithHashState
      title={'Help'}
      icon={<HelpOutlineIcon className='icon-share'/>}
      isDialogDisplayed={isHelpVisible}
      setIsDialogDisplayed={setIsHelpVisible}
      hashPrefix={HASH_PREFIX_HELP}
      placement='left'
      dataTestId='help-control-button'
    >
      <HelpDialog
        isDialogDisplayed={isHelpVisible}
        setIsDialogDisplayed={setIsHelpVisible}
      />
    </ControlButtonWithHashState>
  )
}


/**
 * The main dialog displaying the help contents.
 * Provides controls for navigating between pages of help entries.
 *
 * @property {boolean} isDialogDisplayed Determines if the dialog is displayed
 * @property {Function} setIsDialogDisplayed Callback to set the dialog display state
 * @return {ReactElement}
 */
export function HelpDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const [pageIndex, setPageIndex] = useState(0)
  const totalPages = 4
  return (
    <Dialog
      headerIcon={<HelpOutlineIcon/>}
      headerText={'Help'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={
        <ButtonGroup>
          <TooltipIconButton
            title='Previous'
            placement='right'
            variant='noBackground'
            icon={
              <ArrowBackIcon
                sx={{cursor: pageIndex > 0 ? 'pointer' : 'not-allowed'}}
              />}
            onClick={() => pageIndex > 0 && setPageIndex(pageIndex - 1)}
          />
          <TooltipIconButton
            title='Next'
            icon={
              <ArrowForwardIcon
                sx={{cursor: pageIndex < totalPages - 1 ? 'pointer' : 'not-allowed'}}
              />}
            onClick={() => pageIndex < totalPages - 1 && setPageIndex(pageIndex + 1)}
            placement='right'
            variant='noBackground'
          />
        </ButtonGroup>
      }
      actionIcon={<HelpOutlineIcon/>}
      actionCb={() => setIsDialogDisplayed(false)}
    >
      <HelpList pageIndex={pageIndex}/>
    </Dialog>
  )
}


/**
 * Represents a list of help entries, paginated.
 *
 * @property {number} pageIndex Index of the current displayed page
 * @return {ReactElement}
 */
const HelpList = ({pageIndex}) => {
  const helpContent = [
    <ListItem key='1'>
      <ListItemIcon><TouchAppOutlinedIcon className='icon-share' variant='success'/></ListItemIcon>
      <ListItemText primary='Select' secondary='Double click the model to select a model element'/>
    </ListItem>,
    <ListItem key='2'>
      <ListItemIcon><ShiftIcon className='icon-share' variant='success'/></ListItemIcon>
      <ListItemText primary='Multi-select' secondary='Hold shift to select multiple elements'/>
    </ListItem>,
    <ListItem key='3'>
      <ListItemIcon><FolderOpenIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Open' secondary='Open IFC models from GitHub or local drive'/>
    </ListItem>,
    <ListItem key='4'>
      <ListItemIcon><CropOutlinedIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Sections' secondary='Study the model using standard sections'/>
    </ListItem>,
    <ListItem key='5'>
      <ListItemIcon><FormatListBulletedIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Properties' secondary='Study properties attached to selected element'/>
    </ListItem>,
    <ListItem key='6'>
      <ListItemIcon><FilterCenterFocusIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Isolate' secondary='Isolate selected element'/>
    </ListItem>,
    <ListItem key='7'>
      <ListItemIcon><HideSourceOutlinedIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Hide' secondary='Hide selected element'/>
    </ListItem>,
    <ListItem key='8'>
      <ListItemIcon><VisibilityOutlinedIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Show all' secondary='Show all hidden elements'/>
    </ListItem>,
    <ListItem key='9'>
      <ListItemIcon><CloseIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Reset' secondary='Clear selected elements'/>
    </ListItem>,
    <ListItem key='10'>
      <ListItemIcon><TreeIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Navigate' secondary='Navigate the model using element hierarchy'/>
    </ListItem>,
    <ListItem key='11'>
      <ListItemIcon><HistoryIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Versions' secondary='Access project versions'/>
    </ListItem>,
    <ListItem key='12'>
      <ListItemIcon><SearchIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Search' secondary='Search the model elements and properties'/>
    </ListItem>,
    <ListItem key='13'>
      <ListItemIcon><PortraitIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Hosting' secondary='Log in to get access to projects hosted on GitHub'/>
    </ListItem>,
    <ListItem key='14'>
      <ListItemIcon><ShareIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Share' secondary='Share sectioned portions of the model'/>
    </ListItem>,
    <ListItem key='15'>
      <ListItemIcon><ChatOutlinedIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Notes' secondary='Attach notes to 3D elements'/>
    </ListItem>,
    <ListItem key='16'>
      <ListItemIcon><AutoFixHighOutlinedIcon className='icon-share'/></ListItemIcon>
      <ListItemText primary='Imagine' secondary='Create renderings using Bot the BLDR'/>
    </ListItem>,
  ]

  /* eslint-disable no-magic-numbers */
  const pageContents = [
    helpContent.slice(0, 4),
    helpContent.slice(4, 9),
    helpContent.slice(9, 12),
    helpContent.slice(12),
  ]
  /* eslint-enable no-magic-numbers */

  return (
    <Stack>
      {pageContents[pageIndex].map((item, index) => item)}
    </Stack>
  )
}
