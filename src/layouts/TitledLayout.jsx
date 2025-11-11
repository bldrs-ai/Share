import React, {ReactElement} from 'react'
import {Helmet} from 'react-helmet-async'
import {Link, Paper, Typography} from '@mui/material'
import {useIsMobile} from '../Components/Hooks'
import {LogoB} from '../Components/Logo/Logo'
import {assertDefined} from '../utils/assert'


/**
 * Layout for blog posts and info pages.
 *
 * @property {string} title Page title
 * @property {Array<ReactElement>} children The text content elements for the page
 * @return {ReactElement}
 */
export default function TitledLayout({title, children}) {
  const isMobile = useIsMobile()
  assertDefined(title, children)
  return (
    <>
      <Helmet>
        <title>{title}</title>
      </Helmet>
      <Paper variant='page-background' sx={{height: '100vh', overflowY: 'scroll'}}>
        <Paper
          variant='page'
          elevation={2}
          sx={{
            width: {xs: '100%', md: '8rem'}, // Full width on mobile, fixed on desktop
            float: {xs: 'none', md: 'left'}, // No float on mobile, float on desktop
            margin: {xs: '0 0 1rem 0', md: '0 1rem 1rem 0'}, // Margin for wrapping
          }}
        >
          <Link href="/">
            <LogoB sx={{width: '75px', height: '75px', margin: isMobile ? '0' : '1em 0 0 1em'}}/>
          </Link>
        </Paper>
        <Paper
          variant='page'
          elevation={2}
          sx={{
            'overflow': 'hidden',
            '& .MuiTypography-root': {
              margin: '1em 0',
            },
            '& .MuiTypography-p': {
              textAlign: 'justify',
            },
            '& .MuiTypography-p + .MuiTypography-p': {
              display: 'block',
            },
            'margin': {xs: '0', md: '0 8rem 1rem 0'}, // Margin for wrapping
          }}
        >
          <Typography variant='h1'>{title}</Typography>
          {children}
        </Paper>
        <Typography variant='body2' sx={{fontSize: '0.9em', opacity: 0.75, textAlign: 'center'}}>
          <Link href='/tos'>Terms</Link>
          {' '}-{' '}<Link href='/privacy'>Privacy</Link>
        </Typography>
      </Paper>
    </>
  )
}
