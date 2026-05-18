import Link from 'next/link'
import {Box, Container, Link as MuiLink, Stack, Typography} from '@mui/material'
import LogoB from './LogoB'
import {NAV_ITEMS, SITE_NAME, SOCIAL} from '@/lib/site'


export default function SiteFooter() {
  const year = new Date().getFullYear()
  const muted = {color: 'inherit', opacity: 0.7, textDecoration: 'none', '&:hover': {opacity: 1}}
  return (
    <Box
      component="footer"
      sx={{
        mt: 0,
        borderTop: 1,
        borderColor: 'divider',
        py: 5,
        bgcolor: 'background.paper',
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{xs: 'column', md: 'row'}}
          spacing={3}
          justifyContent="space-between"
          alignItems={{xs: 'flex-start', md: 'center'}}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <LogoB sx={{width: 24, height: 24}}/>
            <Typography variant="body2" sx={{opacity: 0.7}}>
              {SITE_NAME.toLowerCase()}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={3} flexWrap="wrap">
            {NAV_ITEMS.map((item) => (
              <MuiLink key={item.path} component={Link} href={item.path} sx={muted}>
                {item.label}
              </MuiLink>
            ))}
            <MuiLink component={Link} href="/tos" sx={muted}>Terms</MuiLink>
            <MuiLink component={Link} href="/privacy" sx={muted}>Privacy</MuiLink>
          </Stack>

          <Stack direction="row" spacing={2}>
            <MuiLink href={SOCIAL.githubShare} target="_blank" rel="noopener noreferrer" sx={muted}>GitHub</MuiLink>
            <MuiLink href={SOCIAL.linkedin} target="_blank" rel="noopener noreferrer" sx={muted}>LinkedIn</MuiLink>
            <MuiLink href={SOCIAL.twitter} target="_blank" rel="noopener noreferrer" sx={muted}>Twitter</MuiLink>
            <MuiLink href={SOCIAL.discord} target="_blank" rel="noopener noreferrer" sx={muted}>Discord</MuiLink>
            <MuiLink href={SOCIAL.contact} sx={muted}>Contact</MuiLink>
          </Stack>
        </Stack>

        <Typography
          variant="body2"
          sx={{textAlign: 'center', mt: 4, opacity: 0.5}}
        >
          © {year} Bldrs, Inc. All rights reserved.
        </Typography>
      </Container>
    </Box>
  )
}
