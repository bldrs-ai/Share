import {ReactNode} from 'react'
import {Box, Container, Typography} from '@mui/material'
import SiteNav from './SiteNav'
import SiteFooter from './SiteFooter'


/**
 * Standard page chrome: sticky nav, content container, footer. Use this for
 * legal/info pages where the content is a flat document. Hero/landing pages
 * compose SiteNav + SiteFooter directly so they can run edge-to-edge.
 *
 * @param title Page H1 — rendered above children. Omit to render headerless.
 */
export default function PageShell({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <Box sx={{minHeight: '100vh', display: 'flex', flexDirection: 'column'}}>
      <SiteNav/>
      <Container component="main" maxWidth="md" sx={{flex: 1, py: {xs: 4, md: 6}}}>
        {title && (
          <Typography variant="h1" component="h1" sx={{mb: 4}}>
            {title}
          </Typography>
        )}
        {children}
      </Container>
      <SiteFooter/>
    </Box>
  )
}
