import React, {useState, useEffect, useContext} from 'react'
import Toggle from '../Components/Toggle'
import {useTheme} from '@mui/styles'
import * as Privacy from '../privacy/Privacy'
import {ColorModeContext} from '../Context/ColorMode'
import Dialog from './Dialog'
import {ControlButton, RectangularButton} from './Buttons'
import AboutIcon from '../assets/2D_Icons/Information.svg'
import LogoB from '../assets/LogoB_3.svg'
import {Link, List, ListItem, Box, Typography} from '@mui/material'


/**
 * Button to toggle About panel on and off
 *
 * @return {object} The AboutControl react component.
 */
export default function AboutControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(
      Privacy.getCookieBoolean({
        component: 'about',
        name: 'isFirstTime',
        defaultValue: true,
      }),
  )

  return (
    <ControlButton
      title="About BLDRS"
      icon={
        <Box
          sx={{
            width: '20px',
            height: '20px',
            marginBottom: '2px',
          }}
        >
          <AboutIcon />
        </Box>
      }
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <AboutDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={() => {
            setIsDialogDisplayed(false)
            Privacy.setCookieBoolean({
              component: 'about',
              name: 'isFirstTime',
              value: false,
            })
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
      icon={<LogoB />}
      headerText={<LogoB style={{width: '50px', height: '50px'}} />}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<AboutContent setIsDialogDisplayed={setIsDialogDisplayed} />}
      data-test-id={'about-dialog'}
    />
  )
}


/**
 * The content portion of the AboutDialog
 *
 * @return {object} React component
 */
function AboutContent({setIsDialogDisplayed}) {
  const theme = useTheme()
  const colorTheme = useContext(ColorModeContext)
  const [acceptCookies, setAcceptCookies] = useState(true)
  const bulletStyle = {
    textAlign: 'center',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    listStyleType: 'none',
  }
  const linkStyle = {
    paddingRight: '4px',
    paddingBottom: '2px',
    color: theme.palette.highlight.secondary,
  }

  useEffect(() => {
    if (Privacy.isPrivacySocialEnabled()) {
      setAcceptCookies(true)
    } else {
      setAcceptCookies(false)
    }
  }, [])

  const changePrivacy = () => {
    setPrivacy(acceptCookies)
    setAcceptCookies(!acceptCookies)
  }

  return (
    <Box
      sx={{
        minHeight: '330px',
        maxWidth: '250px',
        marginBottom: '10px',
      }}
    >
      <Typography variant="h4">Build Every Thing Together</Typography>
      <Typography gutterBottom={false}>
        We are open source
        <br />
        <Link
          sx={linkStyle}
          href="https://github.com/bldrs-ai/Share"
          target="_new"
        >
          github.com/bldrs-ai/Share
        </Link>
      </Typography>
      <Box
        sx={{
          backgroundColor: colorTheme.isDay() ? '#E8E8E8' : '#4C4C4C',
          borderRadius: '10px',
          opacity: 0.8,
          marginTop: '10px',
        }}
      >
        <List
          sx={{
            width: '100%',
            marginTop: '-2px',
            marginBottom: '15px',
            padding: '4px 6px',
            textAlign: 'left',
            borderRadius: '2px',
          }}
        >
          <ListItem sx={bulletStyle}>
            <Typography variant="h4">
              <Link
                sx={linkStyle}
                href="https://github.com/bldrs-ai/Share/wiki/GitHub-model-hosting"
                target="_new"
              >
                Open IFC models from Github
              </Link>
            </Typography>
          </ListItem>
          <ListItem sx={bulletStyle}>
            <Typography variant="h4">View IFC properties</Typography>
          </ListItem>
          <ListItem sx={bulletStyle}>
            <Typography variant="h4">Search IFC models</Typography>
          </ListItem>
          <ListItem sx={bulletStyle}>
            <Typography variant="h4">Share IFC models</Typography>
          </ListItem>
        </List>
      </Box>

      <Box
        sx={{
          height: '140px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-around',
          alignItems: 'center',
          borderRadius: '10px',
        }}
      >
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box
            variant={'h4'}
            sx={{
              marginLeft: '10px',
              textAlign: 'left',
              marginTop: '6px',
              marginBottom: '6px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
            }}
          >
            <Typography variant={'h4'}>Analytics cookies</Typography>
            <Typography variant={'h4'}>
              <Link
                sx={linkStyle}
                href="https://github.com/bldrs-ai/Share/wiki/Design#privacy"
                target="_new"
              >
                read more
              </Link>
            </Typography>
          </Box>
          <Toggle checked={acceptCookies} onChange={changePrivacy} />
        </Box>
        <RectangularButton
          title="OK"
          onClick={() => setIsDialogDisplayed(false)}
          icon={<AboutIcon />}
          noBorder={false}
        />
      </Box>
    </Box>
  )
}


export const setPrivacy = (acceptCookies) => {
  if (acceptCookies) {
    Privacy.setUsageAndSocialEnabled(false, false)
  } else {
    Privacy.setUsageAndSocialEnabled(true, true)
  }
}
