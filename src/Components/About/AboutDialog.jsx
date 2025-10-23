import React, {ReactElement} from 'react'
import {Helmet} from 'react-helmet-async'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import SvgIcon from '@mui/material/SvgIcon'
import Typography from '@mui/material/Typography'
import Dialog from '../Dialog'
import {LogoBWithDomain} from '../Logo/Logo'
import {ABOUT_MISSION, ABOUT_PAGE_TITLE} from './component'
// TODO(pablo): re-enable after prod freeze bug fixed
// import PrivacyControl from './PrivacyControl'
import GitHubIcon from '@mui/icons-material/GitHub'
import EmailIcon from '@mui/icons-material/Email'
import DiscordIcon from './Discord.svg'


/**
 * @property {boolean} isDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} onClose Callback when closed
 * @return {ReactElement}
 */
export default function AboutDialog({isDialogDisplayed, setIsDialogDisplayed, onClose}) {
  return (
    <Dialog
      headerText={ABOUT_MISSION}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      headerIcon={
        <Link href='/'>
          <LogoBWithDomain
            sx={{
              width: '144px',
              height: '144px',
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
function Thc2({children}) {
  // I'd like to high-light the excellent name of this component
  return <th style={{textAlign: 'center', fontWeight: 'normal'}} colSpan={2}>{children}</th>
}


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
  return (
    <>
      <Helmet>
        <title>{ABOUT_PAGE_TITLE}</title>
      </Helmet>
      <Stack
        spacing={3}
        direction='column'
        justifyContent='center'
        alignItems='center'
      >
        <Stack align='center' justifyContent='center' spacing={2} sx={{width: '100%'}}>
          <Typography variant='body1'>
            <Link href='/share/about'>The fastest browser-based CAD engine</Link>.
          </Typography>
          <Box
            component="ul"
            sx={{
              width: '90%',
              margin: '0 auto',
              listStyleType: 'disc',
              textAlign: 'left',
              display: 'inline-block',
            }}
          >
            <li><strong>Drag &amp; Drop to open; no data upload</strong></li>
            <li>Open standards: IFC 2x3&4, STL, OBJ</li>
            <li>STEP AP214 (<Link href='https://github.com/bldrs-ai/conway-viewer-demo'>early access</Link>)</li>
          </Box>
          <table style={{width: '100%', border: '1px solid rgba(128, 128, 128, .5)', padding: '0.5em'}}>
            <thead>
              <tr><th/><th/><Thc2><em>Login with</em></Thc2><th/></tr>
              <tr><th/><Thc>Always</Thc><Thc>Google</Thc><Thc>GitHub</Thc><Pro/></tr>
            </thead>
            <tbody>
              <tr><td>Fastest viewer</td><Tdc>✓</Tdc><Tdc>✓</Tdc><Tdc>✓</Tdc><Tdc>✓</Tdc></tr>
              <tr><td>Share views</td><Tdc>X</Tdc><Tdc>✓</Tdc><Tdc>✓</Tdc><Tdc>✓</Tdc></tr>
              <tr><td>Placemarks & Notes</td><Tdc>X</Tdc><Tdc>X</Tdc><Tdc>✓</Tdc><Tdc>✓</Tdc></tr>
              <tr><td>Private models</td><Tdc>X</Tdc><Tdc>X</Tdc><Tdc>X</Tdc><Tdc>✓</Tdc></tr>
            </tbody>
          </table>
          <Stack direction='row' justifyContent='center' alignItems='center' spacing={1}>
            <Link href='https://discord.gg/9SxguBkFfQ' rel='noopener' sx={{display: 'flex', alignItems: 'center'}}>
              <SvgIcon sx={{marginRight: '0.25em'}}><DiscordIcon className='icon-share'/></SvgIcon>Discord
            </Link>
            <Link href='https://github.com/bldrs-ai/Share' rel='noopener' sx={{display: 'flex', alignItems: 'center'}}>
              <GitHubIcon className='icon-share' sx={{marginRight: '0.25em'}}/>GitHub
            </Link>
            <Link href='mailto:info@bldrs.ai' sx={{display: 'flex', alignItems: 'center'}}>
              <EmailIcon className='icon-share' sx={{marginRight: '0.25em'}}/>info@bldrs.ai
            </Link>
          </Stack>
          <Typography variant='body2' sx={{fontSize: '0.9em', opacity: 0.75, textAlign: 'center'}}>
            See our <Link href='/tos'>Terms of Service</Link> and <Link href='/privacy'>Privacy Policy</Link>.
          </Typography>
        </Stack>
      </Stack>
    </>)
}
