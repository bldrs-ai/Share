import React, {ReactElement, useState} from 'react'
import {Divider, IconButton, Menu, MenuItem, Typography} from '@mui/material'
import {isFirst, setVisited} from '../../privacy/firstTime'
import useStore from '../../store/useStore'
import AboutDialog from '../About/AboutDialog'
import {LogoB} from '../Logo/Logo'
import PkgJson from '../../../package.json'


// Marketing pages live on the Next.js SSG build (marketing/ — see
// marketing/README.md), served from the apex domain, so these are
// plain external links rather than SPA routes.
const MARKETING_LINKS = [
  {label: 'Pricing', href: 'https://bldrs.ai/pricing'},
  {label: 'News', href: 'https://bldrs.ai/blog'},
]


/**
 * The bldrs.ai logo in the ProjectsDrawer footer; clicking it opens a
 * popup with About (the in-app dialog) and the marketing pages.
 * Wireframe screen 4 of the conversational-CAD set
 * (design/new/conversational-cad.md §2.5).
 *
 * While `?feature=workspace` is on this is the app's only logo — BottomBar
 * drops its AboutControl — so this control inherits that one's job: the
 * version in the tooltip and the About dialog behind the first menu item.
 * Account management joins this popup with `identity-300`'s profile
 * drawer, not duplicated here.
 *
 * @return {ReactElement}
 */
export default function LogoMenu() {
  const isAboutVisible = useStore((state) => state.isAboutVisible)
  const setIsAboutVisible = useStore((state) => state.setIsAboutVisible)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)
  const [anchorEl, setAnchorEl] = useState(null)

  // Mirrors AboutControl#handleDialogClose: first-timers are marked
  // visited so the dialog doesn't force itself open again, and Notes
  // opens to improve the first-run experience (#1320).
  const onAboutClose = () => {
    if (isFirst()) {
      setVisited()
      setIsNotesVisible(true)
    }
    setIsAboutVisible(false)
  }

  return (
    <>
      {/* Plain logo mark at the default icon size, matching the
          AboutControl logo it replaces. */}
      <IconButton
        onClick={(event) => setAnchorEl(event.currentTarget)}
        title={`Bldrs\n${PkgJson.version}`}
        data-testid='workspace-logo-button'
      >
        <LogoB/>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={anchorEl !== null}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{vertical: 'top', horizontal: 'left'}}
        transformOrigin={{vertical: 'bottom', horizontal: 'left'}}
        data-testid='workspace-logo-menu'
      >
        <Typography variant='subtitle2' sx={{fontWeight: 'bold', px: 2, py: 1}}>
          Build Every Thing Together
        </Typography>
        <MenuItem
          onClick={() => {
            setAnchorEl(null)
            setIsAboutVisible(true)
          }}
          data-testid='workspace-logo-menu-about'
        >
          About
        </MenuItem>
        {MARKETING_LINKS.map((link) => (
          <MenuItem
            key={link.label}
            component='a'
            href={link.href}
            target='_blank'
            rel='noopener noreferrer'
            onClick={() => setAnchorEl(null)}
            data-testid={`workspace-logo-menu-${link.label.toLowerCase()}`}
          >
            {link.label}
          </MenuItem>
        ))}
        <Divider/>
        <Typography variant='caption' color='text.secondary' sx={{display: 'block', px: 2, py: 1}}>
          Fastest browser-based CAD
        </Typography>
      </Menu>
      <AboutDialog
        isDialogDisplayed={isAboutVisible}
        setIsDialogDisplayed={setIsAboutVisible}
        onClose={onAboutClose}
      />
    </>
  )
}
