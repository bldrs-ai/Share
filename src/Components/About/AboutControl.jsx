import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {getCookieBoolean, setCookieBoolean} from '../../privacy/Privacy'
import Dialog from '../Dialog'
import Logo from '../Logo'
import {ControlButton} from '../Buttons'
import AboutGuide from './AboutGuide'
import PrivacyControl from './PrivacyControl'
import AboutIcon from '../../assets/2D_Icons/Information.svg'


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
  return (
    <ControlButton
      title='About BLDRS'
      icon={<AboutIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <AboutDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={() => {
            setIsDialogDisplayed(false)
            setCookieBoolean({component: 'about', name: 'isFirstTime', value: false})
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
 * @return {React.Component} React component
 */
function AboutDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  return (
    <Dialog
      icon={
        <Box sx={{display: 'inline-flex', flexDirection: 'column', textAlign: 'center'}}>
          <Logo style={{width: '80px', height: '80px'}}/>
          bldrs.ai
        </Box>
      }
      headerText={''}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<AboutContent setIsDialogDisplayed={setIsDialogDisplayed}/>}
      actionTitle='OK'
      actionCb={() => setIsDialogDisplayed(false)}
    />)
}


/**
 * The content portion of the AboutDialog
 *
 * @return {React.ReactElement} React component
 */
function AboutContent({setIsDialogDisplayed}) {
  return (
    <Box>
      <Typography variant='h1' gutterBottom={true}>Build Every Thing Together</Typography>
      <a href='https://github.com/bldrs-ai/Share' target='_new'>
        github.com/bldrs-ai/Share
      </a>
      <AboutGuide/>
      <PrivacyControl/>
    </Box>)
}
