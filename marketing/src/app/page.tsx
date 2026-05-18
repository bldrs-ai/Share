import type {Metadata} from 'next'
import Link from 'next/link'
import {Box, Button, Container, Stack, Typography} from '@mui/material'
import RocketIcon from '@mui/icons-material/Rocket'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import {SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, VIEWER_PATH} from '@/lib/site'


export const metadata: Metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  alternates: {canonical: '/'},
}


export default function HomePage() {
  return (
    <Box sx={{minHeight: '100vh', display: 'flex', flexDirection: 'column'}}>
      <SiteNav/>

      <Box
        component="section"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(0,240,255,0.08) 0%, transparent 70%), ' +
            'linear-gradient(180deg, rgba(160,255,0,0.04) 0%, transparent 60%)',
        }}
      >
        <Container maxWidth="md" sx={{textAlign: 'center', py: {xs: 8, md: 14}}}>
          <Typography
            variant="overline"
            sx={{color: 'primary.main', fontWeight: 700, letterSpacing: 2, fontSize: '0.85rem'}}
          >
            {SITE_TAGLINE}
          </Typography>
          <Typography variant="h1" component="h1" sx={{mt: 2, mb: 3}}>
            BIM &amp; CAD collaboration{' '}
            <Box component="span" sx={{color: 'secondary.main'}}>in the browser</Box>.
          </Typography>
          <Typography
            variant="body1"
            sx={{maxWidth: 680, mx: 'auto', mb: 5, opacity: 0.85, fontSize: '1.15rem'}}
          >
            {SITE_DESCRIPTION}
          </Typography>
          <Stack
            direction={{xs: 'column', sm: 'row'}}
            spacing={2}
            justifyContent="center"
            alignItems="center"
          >
            <Button
              component="a"
              href={VIEWER_PATH}
              variant="contained"
              size="large"
              startIcon={<RocketIcon/>}
            >
              Launch the viewer
            </Button>
            <Button
              component={Link}
              href="/about"
              variant="outlined"
              size="large"
              sx={{borderColor: 'divider', color: 'text.primary'}}
            >
              Read about Bldrs
            </Button>
          </Stack>
        </Container>
      </Box>

      <SiteFooter/>
    </Box>
  )
}
