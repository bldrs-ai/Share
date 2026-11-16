import React, {ReactElement, useEffect, useState} from 'react'
import {Helmet} from 'react-helmet-async'
import {Box, Button, Link, Stack, SvgIcon, Typography} from '@mui/material'
import {Email as EmailIcon, GitHub as GitHubIcon} from '@mui/icons-material'
import Dialog from '../Dialog'
import {useIsMobile} from '../Hooks'
import {LogoB} from '../Logo/Logo'
import {defaultConsentLevel, getConsentLevel} from '../../privacy/consent'
import chooseConsentLevel from '../../privacy/consentChoice'
import {ABOUT_MISSION, ABOUT_PAGE_TITLE} from './component'
import ConsentControl from './ConsentControl'
import DiscordIcon from './Discord.svg'


/**
 * @property {boolean} isDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} onClose Callback when closed
 * @return {ReactElement}
 */
export default function AboutDialog({isDialogDisplayed, setIsDialogDisplayed, onClose}) {
  const isMobile = useIsMobile()
  // The slider's position. Not stored until OK: this is a proposal the
  // visitor confirms, not a setting that applies as it moves. Re-read on
  // every open so a Cancel last time doesn't leave a stale position.
  const [consentLevel, setConsentLevel] = useState(() => getConsentLevel() ?? defaultConsentLevel())
  useEffect(() => {
    if (isDialogDisplayed) {
      setConsentLevel(getConsentLevel() ?? defaultConsentLevel())
    }
  }, [isDialogDisplayed])
  // Dialog closes itself on backdrop click, Escape and the X button by
  // calling setIsDialogDisplayed(false) directly, which skips actionCb. Every
  // close has to go through onClose instead: that's where the first-time
  // cookie is set and where an undecided visitor's dismissal is stored as
  // Browse only (AboutControl/LogoMenu, consentChoice#dismissConsent), and
  // without it a first-timer who dismissed About by clicking the backdrop
  // got About + the onboarding overlay replayed on the reload after their
  // first drag-and-drop.
  const setIsDisplayed = (isDisplayed) => {
    if (isDisplayed) {
      setIsDialogDisplayed(true)
    } else {
      onClose()
    }
  }
  // OK is the only path that can consent to anything.
  const onOk = () => {
    if (consentLevel !== getConsentLevel()) {
      chooseConsentLevel(consentLevel)
    }
    onClose()
  }
  return (
    <Dialog
      headerText={ABOUT_MISSION}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDisplayed}
      headerIcon={
        <Link href='/'>
          <LogoB
            sx={isMobile ? {
              width: '50px',
              height: '50px',
            } : {
              width: '80px',
              height: '80px',
            }}
          />
        </Link>
      }
      // Cancel and OK side by side at the same size, so declining is as
      // easy as accepting. Both close through onClose like every other path.
      actionTitle={
        <>
          <Button
            variant='outlined'
            onClick={() => setIsDisplayed(false)}
            data-testid='button-dialog-cancel'
          >
            Cancel
          </Button>
          <Button
            variant='contained'
            onClick={onOk}
            aria-label='action-button'
            data-testid='button-dialog-main-action'
          >
            OK
          </Button>
        </>
      }
    >
      <AboutContent consentLevel={consentLevel} setConsentLevel={setConsentLevel}/>
    </Dialog>
  )
}


/**
 * Centered table header cell
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @return {ReactElement}
 */
function Thc({children}) {
  // I'd like to high-light the excellent name of this component
  return <th style={{textAlign: 'center', fontWeight: 'normal'}}>{children}</th>
}


/**
 * Centered table header cell with 2 columns
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @return {ReactElement}
 */
/*
function Thc2({children}) {
  // I'd like to high-light the excellent name of this component
  return <th style={{textAlign: 'center', fontWeight: 'normal'}} colSpan={2}>{children}</th>
}
*/
// TODO(pablo): re-enable after prod bug fixed


/**
 * Centered table header cell with 2 columns
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @return {ReactElement}
 */
function Pro({children}) {
  // I'd like to high-light the excellent name of this component
  return (
    <th
      style={{
        textAlign: 'center',
        fontWeight: 'bold',
        width: '4em',
        color: 'lime',
      }}
    >
      Pro
    </th>
  )
}


/**
 * Centered table data cell
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @return {ReactElement}
 */
function Tdc({children}) {
  return <td style={{textAlign: 'center'}}>{children}</td>
}


/**
 * @property {string} consentLevel the privacy slider's position
 * @property {Function} setConsentLevel called with the slider's new position
 * @return {ReactElement}
 */
function AboutContent({consentLevel, setConsentLevel}) {
  const isMobile = useIsMobile()
  return (
    <Stack align='center' justifyContent='center' spacing={2} sx={{width: '100%', paddingTop: '1em'}}>
      <Helmet>
        <title>{ABOUT_PAGE_TITLE}</title>
      </Helmet>
      <Box
        component="ul"
        sx={{
          width: isMobile ? '100%' : '80%',
          margin: '0 auto',
          listStyleType: 'disc',
          textAlign: 'left',
          display: 'inline-block',
          padding: '0 1.25em',
        }}
      >
        <li>
          <Typography variant='body1'>
            <Link href='/share/about'>Fastest browser-based CAD</Link>
          </Typography>
        </li>
        <li>Drag &amp; Drop; no upload</li>
        <li>Open: IFC 2&4, STL, OBJ, ...</li>
        <li>STEP AP214 (<Link href='https://github.com/bldrs-ai/conway-viewer-demo'>early access</Link>)</li>
      </Box>
      <table style={{
        width: '100%',
        borderTop: '1px solid rgba(128, 128, 128, .5)',
        borderBottom: '1px solid rgba(128, 128, 128, .5)',
        padding: '0.5em 0',
      }}
      >
        <thead>
          <tr><th/><Thc>Always</Thc><Thc>w/GitHub</Thc><Pro/></tr>
        </thead>
        <tbody>
          <tr><td>Fastest</td><Tdc>✓</Tdc><Tdc>✓</Tdc><Tdc>✓</Tdc></tr>
          <tr><td>Share</td><Tdc>X</Tdc><Tdc>✓</Tdc><Tdc>✓</Tdc></tr>
          <tr><td>Private</td><Tdc>X</Tdc><Tdc>X</Tdc><Tdc>✓</Tdc></tr>
        </tbody>
      </table>
      <ConsentControl level={consentLevel} setLevel={setConsentLevel}/>
      <Stack direction='row' justifyContent='center' alignItems='center' spacing={1} sx={{fontSize: '0.9em', opacity: 0.5}}>
        <Link
          href='https://discord.gg/9SxguBkFfQ'
          rel='noopener'
          sx={{display: 'flex', alignItems: 'center', color: 'inherit'}}
        >
          <SvgIcon sx={{marginRight: '0.25em'}}><DiscordIcon className='icon-share'/></SvgIcon>{
            isMobile ? '' : 'Discord'
          }
        </Link>
        <Link
          href='https://github.com/bldrs-ai/Share'
          target='_blank'
          rel='noopener'
          sx={{display: 'flex', alignItems: 'center', color: 'inherit'}}
        >
          <GitHubIcon className='icon-share' sx={{marginRight: '0.25em'}}/>{
            isMobile ? '' : 'GitHub'
          }
        </Link>
        <Link href='mailto:info@bldrs.ai'
          target='_blank'
          rel='noopener'
          sx={{display: 'flex', alignItems: 'center', color: 'inherit'}}
        >
          <EmailIcon className='icon-share' sx={{marginRight: '0.25em'}}/>{
            isMobile ? '' : 'info@bldrs.ai'
          }
        </Link>
      </Stack>
    </Stack>
  )
}
