'use client'
import {useState} from 'react'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {
  AppBar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import RocketIcon from '@mui/icons-material/Rocket'
import {NAV_ITEMS, SITE_NAME, VIEWER_PATH} from '@/lib/site'


/**
 * Top nav with mobile drawer. Lives client-side so the active-route highlight
 * (driven by usePathname) doesn't need to be threaded through props from
 * every page.
 */
export default function SiteNav() {
  const pathname = usePathname()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isActive = (path: string) =>
    pathname === path || (path !== '/' && pathname.startsWith(path))

  return (
    <AppBar
      component="nav"
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{justifyContent: 'space-between', gap: 2}}>
        <Typography
          component={Link}
          href="/"
          variant="h6"
          sx={{
            color: 'inherit',
            textDecoration: 'none',
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          {SITE_NAME}
        </Typography>

        {isMobile ? (
          <>
            <IconButton
              edge="end"
              color="inherit"
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon/>
            </IconButton>
            <Drawer
              anchor="right"
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            >
              <Box sx={{width: 240, pt: 2}} role="presentation">
                <List>
                  {NAV_ITEMS.map((item) => (
                    <ListItem key={item.path} disablePadding>
                      <ListItemButton
                        component={Link}
                        href={item.path}
                        onClick={() => setDrawerOpen(false)}
                        selected={isActive(item.path)}
                      >
                        <ListItemText primary={item.label}/>
                      </ListItemButton>
                    </ListItem>
                  ))}
                  <ListItem disablePadding sx={{mt: 2}}>
                    <ListItemButton
                      component="a"
                      href={VIEWER_PATH}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <ListItemText
                        primary="Launch app"
                        primaryTypographyProps={{color: 'primary', fontWeight: 700}}
                      />
                    </ListItemButton>
                  </ListItem>
                </List>
              </Box>
            </Drawer>
          </>
        ) : (
          <Stack direction="row" spacing={1} alignItems="center">
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.path}
                component={Link}
                href={item.path}
                sx={{
                  color: isActive(item.path) ? 'primary.main' : 'inherit',
                  fontWeight: isActive(item.path) ? 700 : 500,
                }}
              >
                {item.label}
              </Button>
            ))}
            <Button
              component="a"
              href={VIEWER_PATH}
              variant="contained"
              startIcon={<RocketIcon/>}
              sx={{ml: 2}}
            >
              Launch app
            </Button>
          </Stack>
        )}
      </Toolbar>
    </AppBar>
  )
}
