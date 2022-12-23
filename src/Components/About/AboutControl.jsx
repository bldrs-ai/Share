import React, {useState} from 'react'
import Box from '@mui/material/Box'
import {getCookieBoolean, setCookieBoolean} from '../../privacy/Privacy'
import Dialog from '../Dialog'
import {ControlButton} from '../Buttons'
import AboutGuide from './AboutGuide'
import PrivacyControl from './PrivacyControl'
import AboutIcon from '../../assets/2D_Icons/Information.svg'
import LogoB from '../../assets/LogoB_3.svg'


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
          <LogoB style={{width: '100px', height: '100px'}}/>
          bldrs.ai
        </Box>
      }e
      headerText={'Build Every Thing Together'}pa
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<AboutContent setIsDialogDisplayed={setIsDialogDisplayed}/>}
      data-testid={'about-dialog'}
      actionTitle='OK'
      actionIcon={<AboutIcon/>}
      actionCb={() => setIsDialogDisplayed(false)}
    />)
}


/**
 * The content portion of the AboutDialog
 *
 * @return {object} React component
 */
function AboutContent({setIsDialogDisplayed}) {
  return (
    <Box sx={{minHeight: '200px', maxWidth: '250px'}}>
      <a href='https://github.com/bldrs-ai/Share' target='_new'>
        github.com/bldrs-ai/Share
      </a>
      <AboutGuide/>
      <PrivacyControl/>
    </Box>)
}
