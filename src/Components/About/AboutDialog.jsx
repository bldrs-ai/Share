import React, {ReactElement} from 'react'
import {Helmet} from 'react-helmet-async'
import {Box, Link, Stack, SvgIcon, Typography} from '@mui/material'
import {Email as EmailIcon, GitHub as GitHubIcon, X as XIcon} from '@mui/icons-material'
import Dialog from '../Dialog'
import {useIsMobile} from '../Hooks'
import {LogoB} from '../Logo/Logo'
import {ABOUT_MISSION, ABOUT_PAGE_TITLE} from './component'
import DiscordIcon from './Discord.svg'


/**
 * The privacy policy, served by the marketing build (netlify.toml: /privacy/
 * is a file match, so it wins on bldrs.ai). The SPA keeps its own copy at
 * /privacy (BaseRoutes.jsx, pages/Privacy.jsx), which is what a dev server
 * without the marketing build shows; Privacy.test.jsx keeps the two in step.
 */
export const PRIVACY_POLICY_HREF = '/privacy/'


/** First of the About dialog's socials (owner, 2026-11-24). */
export const X_PROFILE_URL = 'https://x.com/bldrs_ai'


/**
 * @property {boolean} isDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} onClose Callback when closed
 * @return {ReactElement}
 */
export default function AboutDialog({isDialogDisplayed, setIsDialogDisplayed, onClose}) {
  const isMobile = useIsMobile()
  // Dialog closes itself on backdrop click, Escape and the X button by
  // calling setIsDialogDisplayed(false) directly, which skips actionCb. Every
  // close has to go through onClose instead: that's where the first-time
  // cookie is set (AboutControl/LogoMenu), and without it a first-timer who
  // dismissed About by clicking the backdrop got About + the onboarding
  // overlay replayed on the reload after their first drag-and-drop.
  const setIsDisplayed = (isDisplayed) => {
    if (isDisplayed) {
      setIsDialogDisplayed(true)
    } else {
      onClose()
    }
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
      actionTitle='OK'
      actionCb={onClose}
    >
      <AboutContent/>
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


/** @return {ReactElement} */
function AboutContent() {
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
        <li>Open: IFC, STEP, STL, OBJ, ...</li>
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
      <Typography variant='body2' color='text.secondary' data-testid='about-privacy'>
        Your models stay on your device.{' '}
        {/* A new tab, so reading the policy doesn't leave the loaded model. */}
        <Link
          href={PRIVACY_POLICY_HREF}
          target='_blank'
          rel='noopener noreferrer'
          color='inherit'
          data-testid='about-privacy-policy'
        >
          Privacy policy
        </Link>
      </Typography>
      <Stack direction='row' justifyContent='center' alignItems='center' spacing={1} sx={{fontSize: '0.9em', opacity: 0.5}}>
        <Link
          href={X_PROFILE_URL}
          target='_blank'
          rel='noopener'
          aria-label='Bldrs on X: @bldrs_ai'
          sx={{display: 'flex', alignItems: 'center', color: 'inherit'}}
          data-testid='about-social-x'
        >
          <XIcon className='icon-share' sx={{marginRight: '0.25em'}}/>{
            isMobile ? '' : '@bldrs_ai'
          }
        </Link>
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
          aria-label='Bldrs on GitHub: bldrs-ai'
          sx={{display: 'flex', alignItems: 'center', color: 'inherit'}}
          data-testid='about-social-github'
        >
          <GitHubIcon className='icon-share' sx={{marginRight: '0.25em'}}/>{
            isMobile ? '' : 'bldrs-ai'
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
