/* eslint-disable no-magic-numbers */
import React, {useState} from 'react'
import {useSwipeable} from 'react-swipeable'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import CloseIcon from '@mui/icons-material/Close'
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined'
import CropOutlinedIcon from '@mui/icons-material/CropOutlined'
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import HideSourceOutlinedIcon from '@mui/icons-material/HideSourceOutlined'
import HistoryIcon from '@mui/icons-material/History'
import PortraitIcon from '@mui/icons-material/Portrait'
import SearchIcon from '@mui/icons-material/Search'
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import {TooltipIconButton} from './Buttons'
import Dialog from './Dialog'
import {LogoBWithDomain} from './Logo'
import TreeIcon from '../assets/icons/Tree.svg'
import ShiftIcon from '../assets/icons/Shift.svg'
import ShareIcon from '../assets/icons/Share.svg'


/**
 * The main component to display a help control button and a help dialog.
 *
 * @property {Function} fileOpen Callback for file opening
 * @property {string} modelPath Path to the model
 * @property {boolean} pisLocalModel Determines if the model is local
 * @return {React.ReactElement} Rendered component
 */
export default function HelpControl({fileOpen, modelPath, isLocalModel}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  return (
    <Box>
      <TooltipIconButton
        tooltip={'Help'}
        onClick={() => setIsDialogDisplayed(true)}
        icon={<HelpOutlineIcon className='icon-share' color='secondary'/>}
        placement={'left'}
        selected={isDialogDisplayed}
        showTitle={true}
        variant='noBackground'
      />
      {isDialogDisplayed && (
        <HelpDialog isDialogDisplayed={isDialogDisplayed} setIsDialogDisplayed={setIsDialogDisplayed}/>
      )}
    </Box>
  )
}


/**
 * Represents a single help entry with an icon and a description.
 *
 * @property {React.Element} icon Icon for the help entry
 * @property {string} description Description text for the help entry
 * @return {React.Component}
 */
function HelpComponent({icon, description}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        width: '230px',
        marginBottom: '10px',
        paddingBottom: '2px',
        paddingTop: '2px',
      }}
    >
      <Box sx={{marginLeft: '10px'}}>{icon}</Box>
      <Typography
        variant='overline'
        sx={{
          marginLeft: '34px',
          width: '220px',
          textAlign: 'left',
          lineHeight: '1.4em',
        }}
      >
        {description}
      </Typography>
    </Box>
  )
}


/**
 * Represents a list of help entries, paginated.
 *
 * @property {number} pageIndex Index of the current displayed page
 * @return {React.Component}
 */
function HelpList({pageIndex}) {
  const helpContent = [
    {
      icon: <CreateNewFolderOutlinedIcon className='icon-share' color='secondary'/>,
      description:
      <Typography variant='overline' sx={{lineHeight: '1.4em'}}>
        Open IFC models from GITHUB  <br/> or local drive
      </Typography>,
    },
    {
      icon: <CropOutlinedIcon className='icon-share' color='secondary'/>,
      description: 'Study the model using standard sections',
    },
    {
      icon: <TouchAppOutlinedIcon className='icon-share' color='primary'/>,
      description:
      <Typography variant='overline' sx={{lineHeight: '1.4em'}}>
        Double click the model to select <br/> a model element
      </Typography>,
    },
    {
      icon: <ShiftIcon className='icon-share'/>,
      description: 'Hold shift to select multiple elements',
    },
    {
      icon: <FormatListBulletedIcon className='icon-share' color='secondary'/>,
      description:
      <Typography variant='overline' sx={{lineHeight: '1.4em'}}>
        Study properties attached to  <br/> selected element
      </Typography>,
    },
    {
      icon: <FilterCenterFocusIcon className='icon-share' color='secondary'/>,
      description: 'Isolate selected element',
    },
    {
      icon: <HideSourceOutlinedIcon className='icon-share' color='secondarygit p'/>,
      description:
      <Typography variant='overline' sx={{lineHeight: '1.4em'}}>
        Hide selected  <br/> element
      </Typography>,
    },
    {
      icon: <VisibilityOutlinedIcon className='icon-share' color='secondary'/>,
      description: `Show all hidden elements`,
    },
    {
      icon: <CloseIcon className='icon-share' color='secondary'/>,
      description: 'Clear selected elements',
    },
    {
      icon:
      <TreeIcon
        className='icon-share'
        color='secondary'
        style={{margin: '0px 2px 0px 3px', width: '20px'}}
      />,
      description:
      <Typography variant='overline' sx={{lineHeight: '1.4em'}}>
        Navigate <br/> the model using element hierarchy
      </Typography>,
    },
    {
      icon: <HistoryIcon className='icon-share' color='secondary'/>,
      description: 'Access project model version history',
    },
    {
      icon: <SearchIcon className='icon-share' color='secondary'/>,
      description: 'Search the model',
    },
    {
      icon: <PortraitIcon className='icon-share' color='secondary'/>,
      description: 'Log in to get access to projects hosted on Github',
    },
    {
      icon: <ShareIcon className='icon-share' color='secondary' style={{margin: '0px 1px'}}/>,
      description: 'Share sectioned portions of the model',
    },
    {
      icon: <ChatOutlinedIcon className='icon-share' color='secondary'/>,
      description: 'Attach notes to 3D elements',
    },
    {
      icon: <AutoFixHighIcon className='icon-share' color='secondary'/>,
      description: 'Renerate renderings using BLDR AI Agent',
    },
  ]

  const pageContents = [
    helpContent.slice(0, 4),
    helpContent.slice(4, 9),
    helpContent.slice(9, 12),
    helpContent.slice(12),
  ]

  return (
    <Box sx={{marginLeft: '10px', height: '240px'}}>
      {pageContents[pageIndex].map((item, index) => (
        <HelpComponent key={index} icon={item.icon} description={item.description}/>
      ))}
    </Box>
  )
}


/**
 * The main dialog displaying the help contents. Provides controls for
 * navigating between pages of help entries.
 *
 * @property {boolean} isDialogDisplayed Determines if the dialog is displayed
 * @property {Function} setIsDialogDisplayed Callback to set the dialog display state
 * @return {React.ReactElement} Rendered component
 */
function HelpDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const [pageIndex, setPageIndex] = useState(0)
  const totalPages = 4
  const theme = useTheme()


  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (pageIndex < totalPages - 1) {
        setPageIndex(pageIndex + 1)
      }
    },
    onSwipedRight: () => {
      if (pageIndex > 0) {
        setPageIndex(pageIndex - 1)
      }
    },
  })

  return (
    <Dialog
      headerIcon={<HelpOutlineIcon className='icon-share'/>}
      headerText={<LogoBWithDomain className='icon-share'/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'OK'}
      actionIcon={<HelpOutlineIcon className='icon-share'/>}
      actionCb={() => setIsDialogDisplayed(false)}
      content={
        <Box
          sx={{
            width: '250px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '10px',
          }}
          {...swipeHandlers}
        >
          <HelpList pageIndex={pageIndex}/>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              width: '68%',
              marginTop: '6px',
              alignItems: 'center',
            }}
          >
            <TooltipIconButton
              tooltip='Previous'
              placement='right'
              variant='noBackground'
              icon={
                <ArrowBackIcon
                  className='icon-share'
                  color='secondary'
                  sx={{cursor: pageIndex > 0 ? 'pointer' : 'not-allowed'}}
                />}
              onClick={() => pageIndex > 0 && setPageIndex(pageIndex - 1)}
            />

            <Stack
              sx={{width: '100%'}}
              direction="row"
              justifyContent="center"
              alignItems="center"
            >
              <Stack
                direction='row' sx={{width: '38px'}}
              >
                {[...Array(totalPages)].map((_, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      width: '6px',
                      height: '6px',
                      backgroundColor: idx === pageIndex ? theme.palette.primary.main : theme.palette.secondary.background,
                      borderRadius: '50%',
                      marginX: '2px',
                    }}
                  />
                ))}
              </Stack>
            </Stack>
            <TooltipIconButton
              tooltip='Next'
              placement='right'
              variant='noBackground'
              icon={
                <ArrowForwardIcon
                  className='icon-share'
                  color='secondary'
                  sx={{cursor: pageIndex < totalPages - 1 ? 'pointer' : 'not-allowed'}}
                />}
              onClick={() => pageIndex < totalPages - 1 && setPageIndex(pageIndex + 1)}
            />
          </Box>
        </Box>
      }
    />
  )
}
