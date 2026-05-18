import Link from 'next/link'
import {Box, Container, Link as MuiLink, Stack, Typography} from '@mui/material'
import {NAV_ITEMS, SITE_NAME, SOCIAL} from '@/lib/site'


export default function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <Box
      component="footer"
      sx={{
        mt: 8,
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
          <Typography variant="body2" sx={{opacity: 0.7}}>
            © {year} {SITE_NAME}. Smarter Building Together.
          </Typography>

          <Stack direction="row" spacing={3} flexWrap="wrap">
            {NAV_ITEMS.map((item) => (
              <MuiLink
                key={item.path}
                component={Link}
                href={item.path}
                color="inherit"
                sx={{opacity: 0.7, '&:hover': {opacity: 1}}}
              >
                {item.label}
              </MuiLink>
            ))}
            <MuiLink component={Link} href="/tos" color="inherit" sx={{opacity: 0.7, '&:hover': {opacity: 1}}}>
              Terms
            </MuiLink>
            <MuiLink component={Link} href="/privacy" color="inherit" sx={{opacity: 0.7, '&:hover': {opacity: 1}}}>
              Privacy
            </MuiLink>
          </Stack>

          <Stack direction="row" spacing={2}>
            <MuiLink href={SOCIAL.github} target="_blank" rel="noopener" color="inherit" sx={{opacity: 0.7, '&:hover': {opacity: 1}}}>
              GitHub
            </MuiLink>
            <MuiLink href={SOCIAL.discord} target="_blank" rel="noopener" color="inherit" sx={{opacity: 0.7, '&:hover': {opacity: 1}}}>
              Discord
            </MuiLink>
            <MuiLink href={SOCIAL.contact} color="inherit" sx={{opacity: 0.7, '&:hover': {opacity: 1}}}>
              Contact
            </MuiLink>
          </Stack>
        </Stack>
      </Container>
    </Box>
  )
}
