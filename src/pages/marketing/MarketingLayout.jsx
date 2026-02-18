import React, {ReactElement} from 'react'
import {Link as RouterLink, useLocation} from 'react-router-dom'
import {
  AppBar,
  Box,
  Button,
  Container,
  Link,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material'
import {Rocket as RocketIcon} from '@mui/icons-material'
import {LogoB} from '../../Components/Logo/Logo'


const NAV_ITEMS = [
  {label: 'About', path: '/about'},
  {label: 'Pricing', path: '/pricing'},
  {label: 'Services', path: '/services'},
]


/**
 * Shared layout for marketing pages with navigation bar and footer.
 *
 * @property {ReactElement} children Page content
 * @return {ReactElement}
 */
export default function MarketingLayout({children}) {
  const location = useLocation()

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      bgcolor: 'background.default',
      color: 'text.primary',
    }}>
      {/* Navigation Bar */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <Toolbar sx={{justifyContent: 'space-between'}}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LogoB sx={{width: 36, height: 36}}/>
            <Typography
              variant="h6"
              component={RouterLink}
              to="/about"
              sx={{
                textDecoration: 'none',
                color: 'inherit',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              bldrs.ai
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.path}
                component={RouterLink}
                to={item.path}
                sx={{
                  color: location.pathname === item.path ? 'lime' : 'inherit',
                  fontWeight: location.pathname === item.path ? 700 : 400,
                  textTransform: 'none',
                  fontSize: '0.95rem',
                  '&:hover': {color: 'lime'},
                }}
              >
                {item.label}
              </Button>
            ))}
            <Button
              component={RouterLink}
              to="/share"
              variant="contained"
              startIcon={<RocketIcon/>}
              sx={{
                ml: 2,
                bgcolor: 'lime',
                color: '#000',
                fontWeight: 700,
                textTransform: 'none',
                '&:hover': {bgcolor: '#a0ff00'},
              }}
            >
              Launch App
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      {/* Page Content */}
      <Box sx={{flex: 1}}>
        {children}
      </Box>

      {/* Footer */}
      <Box
        component="footer"
        sx={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          py: 4,
          px: 2,
        }}
      >
        <Container maxWidth="lg">
          <Stack
            direction={{xs: 'column', md: 'row'}}
            justifyContent="space-between"
            alignItems="center"
            spacing={2}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <LogoB sx={{width: 24, height: 24}}/>
              <Typography variant="body2" sx={{opacity: 0.7}}>
                bldrs.ai
              </Typography>
            </Stack>

            <Stack direction="row" spacing={3}>
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  component={RouterLink}
                  to={item.path}
                  sx={{color: 'inherit', opacity: 0.7, textDecoration: 'none', '&:hover': {opacity: 1}}}
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/tos" sx={{color: 'inherit', opacity: 0.7, textDecoration: 'none', '&:hover': {opacity: 1}}}>
                Terms
              </Link>
              <Link href="/privacy" sx={{color: 'inherit', opacity: 0.7, textDecoration: 'none', '&:hover': {opacity: 1}}}>
                Privacy
              </Link>
            </Stack>

            <Stack direction="row" spacing={2}>
              <Link
                href="https://discord.gg/9SxguBkFfQ"
                target="_blank"
                rel="noopener"
                sx={{color: 'inherit', opacity: 0.7, '&:hover': {opacity: 1}}}
              >
                Discord
              </Link>
              <Link
                href="https://github.com/bldrs-ai/Share"
                target="_blank"
                rel="noopener"
                sx={{color: 'inherit', opacity: 0.7, '&:hover': {opacity: 1}}}
              >
                GitHub
              </Link>
              <Link
                href="mailto:info@bldrs.ai"
                sx={{color: 'inherit', opacity: 0.7, '&:hover': {opacity: 1}}}
              >
                Contact
              </Link>
            </Stack>
          </Stack>

          <Typography
            variant="body2"
            sx={{textAlign: 'center', mt: 3, opacity: 0.5}}
          >
            &copy; {new Date().getFullYear()} Bldrs, Inc. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  )
}
