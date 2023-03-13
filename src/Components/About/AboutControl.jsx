import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {getCookieBoolean, setCookieBoolean} from '../../privacy/Privacy'
import useStore from '../../store/useStore'
import Dialog from '../Dialog'
import {ControlButton} from '../Buttons'
// import AboutGuide from './AboutGuide'
import AboutDescription from './AboutDescription'
import PrivacyControl from './PrivacyControl'
import AboutIcon from '../../assets/icons/Information.svg'
import LogoB from '../../assets/LogoB.svg'
import {Helmet} from 'react-helmet-async'


/**
 * Button to toggle About panel on and off
 *
 * @return {React.ReactElement}
 */
export default function AboutControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(getCookieBoolean({
    component: 'about',
    name: 'isFirstTime',
    defaultValue: true,
  }))
  const toggleIsTooltipsOpen = useStore((state) => state.toggleIsTooltipsOpen)
  const setIsDialogDisplayedLocal = (value) => {
    setIsDialogDisplayed(value)
    toggleIsTooltipsOpen()
  }
  return (
    <ControlButton
      title='About bldrs'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayedLocal}
      icon={
        <AboutIcon
          style={{
            width: '20px',
            height: '20px',
          }}
        />
      }
      dialog={
        <AboutDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={() => {
            setIsDialogDisplayed(false)
            setCookieBoolean({component: 'about', name: 'isFirstTime', value: false})
            toggleIsTooltipsOpen()
          }}
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
 * @return {React.ReactElement} React component
 */
function AboutDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  return (
    <Dialog
      icon={
        <Box sx={{display: 'inline-flex', flexDirection: 'column', textAlign: 'center'}}>
          <LogoB style={{width: '60px', height: '60px'}}/>
          <Typography variant='h6'sx={{marginLeft: '-9px', marginTop: '6px'}}>bldrs.ai</Typography>
        </Box>
      }
      headerText={''}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<AboutContent setIsDialogDisplayed={setIsDialogDisplayed}/>}
      actionTitle='OK'
      actionCb={() => setIsDialogDisplayed(false)}
    />
  )
}


/**
 * The content portion of the AboutDialog
 *
 * @return {React.ReactElement} React component
 */
function AboutContent({setIsDialogDisplayed}) {
  return (
    <Box sx={{'& a': {textDecoration: 'none'}}}>
      <Helmet>
        <title>About — BLDRS</title>
      </Helmet>
      <Typography variant='h2' gutterBottom={true}>build every thing together</Typography>
      <a href='https://github.com/bldrs-ai/Share' target='_new'>
        github.com/bldrs-ai/Share
      </a>
      <AboutDescription setIsDialogDisplayed={setIsDialogDisplayed}/>
      <PrivacyControl/>
    </Box>)
}
