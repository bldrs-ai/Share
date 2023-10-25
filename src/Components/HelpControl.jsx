/* eslint-disable no-magic-numbers */
import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import TreeIcon from '../assets/icons/Tree.svg'
import ShareIcon from '../assets/icons/Share.svg'
import LogoB from '../assets/LogoB.svg'
import CropOutlinedIcon from '@mui/icons-material/CropOutlined'
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import FormatListBulletedOutlinedIcon from '@mui/icons-material/FormatListBulletedOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import HistoryIcon from '@mui/icons-material/History'
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus'
import PortraitIcon from '@mui/icons-material/Portrait'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'


/**
 * The main component to display a help control button and a help dialog.
 *
 * @function
 * @param {object} props - Component props
 * @param {Function} fileOpen - Callback for file opening
 * @param {string} modelPath - Path to the model
 * @param {boolean} pisLocalModel - Determines if the model is local
 * @return {React.ReactElement} Rendered component
 */
export default function HelpControl({fileOpen, modelPath, isLocalModel}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)

  return (
    <Box>
      <TooltipIconButton
        title={'Help'}
        onClick={() => setIsDialogDisplayed(true)}
        icon={<InfoOutlinedIcon color='secondary'/>}
        placement={'left'}
        selected={isDialogDisplayed}
        dataTestId='open-ifc'
        showTitle={true}
        variant='rounded'
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
 * @function
 * @param {object} props - Component props
 * @param {React.ReactElement} props.icon - Icon for the help entry
 * @param {string} props.description - Description text for the help entry
 * @return {React.ReactElement} Rendered component
 */
const HelpComponent = ({icon, description}) => {
  const theme = useTheme()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        width: '250px',
        marginBottom: '10px',
        paddingBottom: '4px',
        borderBottom: `1px solid ${theme.palette.background.button}`,
      }}
    >
      <Box sx={{marginLeft: '10px'}}>{icon}</Box>
      <Typography
        variant='overline'
        sx={{
          marginLeft: '30px',
          width: '180px',
          textAlign: 'left',
          lineHeight: '1.2em',
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
 * @function
 * @param {object} props - Component props
 * @param {number} props.pageIndex - Index of the current displayed page
 * @return {React.ReactElement} Rendered component
 */
const HelpList = ({pageIndex}) => {
  const helpContent = [
    {
      icon:
      <Box
        sx={{
          '& svg': {
            'marginTop': '6px',
            'marginLeft': '3px',
            'width': '20px',
            '@media (max-width: 900px)': {
              marginTop: '4px',
              width: '20px',
            },
          },
        }}
      >
        <LogoB/>
      </Box>,
      description: 'Show / Hide Bldrs tools',
    },
    {
      icon: <CropOutlinedIcon color='secondary'/>,
      description: 'Study the project using standard sections',
    },
    {
      icon: <TouchAppOutlinedIcon className='icon-share' color='secondary'/>,
      description: 'Double click / tap the model to select model element',
    },
    {
      icon: <FilterCenterFocusIcon className='icon-share' color='secondary'/>,
      description: 'Isolate selected element',
    },
    {
      icon: <VisibilityOffOutlinedIcon className='icon-share' color='secondary'/>,
      description: 'Hide selected element',
    },
    {
      icon: <VisibilityOutlinedIcon className='icon-share' color='secondary'/>,
      description: 'Unhide all of the hidden elements',
    },
    {
      icon: <FormatListBulletedOutlinedIcon className='icon-share' color='secondary'/>,
      description: 'Study properties attached to selected element',
    },
    {
      icon: <CreateNewFolderOutlinedIcon color='secondary'/>,
      description: 'Open IFC projects from GITHUB or local drive',
    },
    {
      icon: <TreeIcon className='icon-share' color='secondary' style={{marginRight: '2px'}}/>,
      description: 'Navigate the project using element hierarchies',
    },
    {
      icon: <HistoryIcon color='secondary'/>,
      description: 'Access project version history',
    },
    {
      icon: <PortraitIcon className='icon-share' color='secondary' style={{marginRight: '2px'}}/>,
      description: 'Log in to get access to projects hosted on Github',
    },
    {
      icon: <ShareIcon className='icon-share' color='secondary' style={{marginRight: '2px'}}/>,
      description: 'Share sectioned portions of the project',
    },
    {
      icon: <ChatOutlinedIcon color='secondary'/>,
      description: 'Attach notes to 3D elements',
    },

  ]

  const pageContents = [
    helpContent.slice(0, 3),
    helpContent.slice(3, 7),
    helpContent.slice(7, 10),
    helpContent.slice(10),
  ]

  return (
    <Box sx={{marginLeft: '10px', height: '200px'}}>
      {pageContents[pageIndex].map((item, index) => (
        <HelpComponent key={index} icon={item.icon} description={item.description}/>
      ))}
    </Box>
  )
}

/**
 * The main dialog displaying the help contents.
 * Provides controls for navigating between pages of help entries.
 *
 * @function
 * @param {object} props - Component props
 * @param {boolean} props.isDialogDisplayed - Determines if the dialog is displayed
 * @param {Function} props.setIsDialogDisplayed - Callback to set the dialog display state
 * @return {React.ReactElement} Rendered component
 */
function HelpDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const [pageIndex, setPageIndex] = useState(0)
  const totalPages = 4
  const theme = useTheme()

  return (
    <Dialog
      icon={<InfoOutlinedIcon/>}
      headerText={'Bldrs.ai'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'OK'}
      actionIcon={<InfoOutlinedIcon/>}
      actionCb={() => setIsDialogDisplayed(false)}
      content={
        <Box
          sx={{
            width: '260px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
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
              title='Next'
              placement='right'
              variant='noBackground'
              icon={
                <ArrowBackIcon
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
                direction='row' sx={{width: '54px'}}
              >
                {[...Array(totalPages)].map((_, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: idx === pageIndex ? theme.palette.primary.main : theme.palette.secondary.background,
                      borderRadius: '50%',
                      marginX: '2px',
                    }}
                  />
                ))}
              </Stack>
            </Stack>
            <TooltipIconButton
              title='Next'
              placement='right'
              variant='noBackground'
              icon={
                <ArrowForwardIcon
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


export {HelpDialog}
