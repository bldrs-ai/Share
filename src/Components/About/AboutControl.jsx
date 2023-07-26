import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import {getCookieBoolean, setCookieBoolean} from '../../privacy/Privacy'
import useStore from '../../store/useStore'
import Dialog from '../Dialog'
import {ControlButton} from '../Buttons'
import AboutDescription from './AboutDescription'
import PrivacyControl from './PrivacyControl'
import AboutIcon from '../../assets/icons/Information.svg'
import LogoB from '../../assets/LogoB.svg'
import {Helmet} from 'react-helmet-async'


/**
 * Button to toggle About panel on and off
 *
 * @return {React.Component}
 */
export default function AboutControl({closeMenu}) {
  const isAboutDialogSuppressed = useStore((state) => state.isAboutDialogSuppressed)
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(getCookieBoolean({
    component: 'about',
    name: 'isFirstTime',
    defaultValue: true,
  }))
  const setIsDialogDisplayedLocal = (value) => {
    setIsDialogDisplayed(value)
  }

  const setIsDialogDisplayedForDialog = () => {
    setIsDialogDisplayed(false)
    setCookieBoolean({component: 'about', name: 'isFirstTime', value: false})
  }

  return (
    <ControlButton
      title='About'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayedLocal}
      placement={'left'}
      showTitle={true}
      icon={
        <AboutIcon
          style={{
            width: '18px',
            height: '18px',
          }}
        />
      }
      dialog={
        <AboutDialog
          closeMenu={closeMenu}
          isDialogDisplayed={isAboutDialogSuppressed ? false : isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayedForDialog}
        />
      }
    />
  )
}


/**
 * The AboutDialog component
 *
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @param {Function} closeMenu
 * @return {React.ReactElement} React component
 */
export function AboutDialog({isDialogDisplayed, setIsDialogDisplayed, closeMenu}) {
  return (
    <Dialog
      icon={
        <Box sx={{display: 'inline-flex', flexDirection: 'column', textAlign: 'center'}}>
          <LogoB style={{width: '60px', height: '60px'}}/>
          <Typography variant='h6' sx={{marginLeft: '-9px', marginTop: '6px'}}>bldrs.ai</Typography>
        </Box>
      }
      headerText={''}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<AboutContent setIsDialogDisplayed={setIsDialogDisplayed} closeMenu={closeMenu}/>}
      actionTitle='OK'
      actionCb={() => {
        closeMenu()
        setIsDialogDisplayed(false)
      }
      }
    />
  )
}


/**
 * The content portion of the AboutDialog
 *
 * @param {Function} closeMenu
 * @return {React.ReactElement} React component
 */
function AboutContent({setIsDialogDisplayed, closeMenu}) {
  const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const showProjectPanel = useStore((state) => state.showProjectPanel)
  const theme = useTheme()
  return (
    <Box sx={{'& a': {textDecoration: 'none'}}}>
      <Helmet>
        <title>About — BLDRS</title>
      </Helmet>
      <Typography variant='h2' gutterBottom={true}>Build every thing together</Typography>
      <a href='https://github.com/bldrs-ai/Share' target='_new'>
        github.com/bldrs-ai/Share
      </a>
      <AboutDescription setIsDialogDisplayed={setIsDialogDisplayed}/>
      <Box
        sx={{
          'border': `1px solid ${theme.palette.primary.main}`,
          'color': theme.palette.primary.contrastText,
          'borderRadius': '5px',
          'height': '40px',
          'display': 'flex',
          'justifyContent': 'center',
          'alignItems': 'center',
          'cursor': 'pointer',
          '&:hover': {
            backgroundColor: 'green',
            color: 'white',
          },
        }}
        onClick={() => {
          if (!showProjectPanel) {
            toggleShowProjectPanel()
            setIsDialogDisplayed()
            closeMenu()
          }
        }}
      >
        <Typography variant={'h4'}>
          Open Project
        </Typography>
      </Box>
      <PrivacyControl/>
    </Box>)
}
