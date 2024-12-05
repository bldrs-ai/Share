import React, {ReactElement} from 'react'
import {Helmet} from 'react-helmet-async'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import {LogoBWithDomain} from '../Components/Logo/Logo'
import {assertDefined} from '../utils/assert'


/**
 * Layout for blog posts and info pages.
 *
 * @property {string} title Page title
 * @property {Array<ReactElement>} children The text content elements for the page
 * @return {ReactElement}
 */
export default function TitledLayout({title, children}) {
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
          <Link href="/"><LogoBWithDomain sx={{width: '8rem', height: '8rem'}}/></Link>
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
            'margin': {xs: '0 0 1rem 0', md: '0 8rem 1rem 0'}, // Margin for wrapping
          }}
        >
          <Typography variant='h1'>{title}</Typography>
          {children}
        </Paper>
      </Paper>
    </>
  )
}
