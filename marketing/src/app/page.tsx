import type {Metadata} from 'next'
import Link from 'next/link'
import {Box, Button, Container, Stack, Typography} from '@mui/material'
import RocketIcon from '@mui/icons-material/Rocket'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import {SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE} from '@/lib/site'
import {CYAN, LIME, LIME_HOVER} from '@/lib/theme'


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
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(0,240,255,0.08) 0%, transparent 70%), ' +
            'linear-gradient(180deg, rgba(0,255,0,0.04) 0%, transparent 60%)',
        }}
      >
        <Container maxWidth="md" sx={{textAlign: 'center', py: {xs: 8, md: 14}}}>
          <Typography
            variant="overline"
            sx={{color: LIME, fontSize: '0.85rem', display: 'block', textTransform: 'uppercase', mb: 2}}
          >
            {SITE_TAGLINE}
          </Typography>
          <Typography variant="h1" component="h1" sx={{mb: 3}}>
            Tomorrow&apos;s innovations won&apos;t start with a drawing.{' '}
            <Box component="span" sx={{color: CYAN}}>They will start with a prompt.</Box>
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
              href="/share"
              variant="contained"
              size="large"
              startIcon={<RocketIcon/>}
              sx={{bgcolor: LIME, color: '#000', fontWeight: 700, px: 4, py: 1.5, fontSize: '1.1rem', '&:hover': {bgcolor: LIME_HOVER}}}
            >
              Launch the Viewer
            </Button>
            <Button
              component={Link}
              href="/about"
              variant="outlined"
              size="large"
              sx={{borderColor: 'rgba(255,255,255,0.3)', color: 'inherit', fontWeight: 600, px: 4, py: 1.5, fontSize: '1.1rem', '&:hover': {borderColor: CYAN, color: CYAN}}}
            >
              Learn More
            </Button>
          </Stack>
        </Container>
      </Box>

      <SiteFooter/>
    </Box>
  )
}
