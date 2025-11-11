import React, {ReactElement, useEffect, useState} from 'react'
import {ButtonGroup, ListItem, ListItemIcon, ListItemText, SvgIcon, Stack} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  AutoFixHighOutlined as AutoFixHighOutlinedIcon,
  ChatOutlined as ChatOutlinedIcon,
  Close as CloseIcon,
  CreateNewFolderOutlined as CreateNewFolderOutlinedIcon,
  CropOutlined as CropOutlinedIcon,
  FileUpload as ShiftIcon,
  FilterCenterFocus as FilterCenterFocusIcon,
  FormatListBulleted as FormatListBulletedIcon,
  HelpOutline as HelpOutlineIcon,
  HideSourceOutlined as HideSourceOutlinedIcon,
  History as HistoryIcon,
  Portrait as PortraitIcon,
  Search as SearchIcon,
  Share as ShareIcon,
  TouchAppOutlined as TouchAppOutlinedIcon,
  VisibilityOutlined as VisibilityOutlinedIcon,
} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import Dialog from '../Dialog'
import OnboardingOverlay from '../Onboarding/OnboardingOverlay'
import TreeIcon from '../../assets/icons/Tree.svg'


/**
 * ControlButton that toggles HelpDialog, with nav state
 *
 * @return {ReactElement}
 */
export default function HelpControl() {
  const isHelpVisible = useStore((state) => state.isHelpVisible)
  const setIsHelpVisible = useStore((state) => state.setIsHelpVisible)
  const setIsHelpTooltipsVisible = useStore((state) => state.setIsHelpTooltipsVisible)
  const isOnboardingOverlayVisible = useStore((state) => state.isOnboardingOverlayVisible)
  const onboardingOverlaySource = useStore((state) => state.onboardingOverlaySource)
  const setIsOnboardingOverlayVisible = useStore((state) => state.setIsOnboardingOverlayVisible)

  const [shouldShowHelpAfterOnboarding, setShouldShowHelpAfterOnboarding] = useState(false)

  // Handle Help button click - always show onboarding first
  const handleHelpClick = () => {
    if (!isOnboardingOverlayVisible) {
      // Show onboarding overlay first
      setIsOnboardingOverlayVisible(true, 'help')
      setShouldShowHelpAfterOnboarding(true)
    } else {
      // Toggle help dialog if overlay is already visible
      setIsHelpVisible(!isHelpVisible)
    }
  }

  // Handle onboarding overlay close - then show help dialog unless file was processed
  const handleOnboardingClose = (skipHelp = false) => {
    setIsOnboardingOverlayVisible(false)
    if (shouldShowHelpAfterOnboarding && !skipHelp) {
      setShouldShowHelpAfterOnboarding(false)
      setIsHelpVisible(true)
    } else if (shouldShowHelpAfterOnboarding) {
      // Reset flag even if skipping help
      setShouldShowHelpAfterOnboarding(false)
    }
  }

  useEffect(() => {
    setIsHelpTooltipsVisible(isHelpVisible)
  }, [isHelpVisible, setIsHelpTooltipsVisible])

  return (
    <>
      <TooltipIconButton
        title={'Help'}
        onClick={handleHelpClick}
        icon={<HelpOutlineIcon className='icon-share'/>}
        selected={isHelpVisible}
        variant='control'
        color='success'
        size='small'
        placement='top'
        dataTestId={testId}
      />
      <HelpDialog
        isDialogDisplayed={isHelpVisible}
        setIsDialogDisplayed={setIsHelpVisible}
      />
      {onboardingOverlaySource === 'help' && (
        <OnboardingOverlay
          isVisible={isOnboardingOverlayVisible}
          onClose={handleOnboardingClose}
        />
      )}
    </>
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
      <ListItemIcon><CreateNewFolderOutlinedIcon className='icon-share'/></ListItemIcon>
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
      <ListItemIcon><SvgIcon><TreeIcon className='icon-share'/></SvgIcon></ListItemIcon>
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
      {pageContents[pageIndex].map((item) => item)}
    </Stack>
  )
}


export const testId = 'control-button-help'
