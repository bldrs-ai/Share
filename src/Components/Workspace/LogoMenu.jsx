import React, {ReactElement, useState} from 'react'
import {Divider, IconButton, Menu, MenuItem, Typography} from '@mui/material'
import {LogoB} from '../Logo/Logo'


// Marketing pages live on the Next.js SSG build (marketing/ — see
// marketing/README.md), served from the apex domain, so these are
// plain external links rather than SPA routes.
const MARKETING_LINKS = [
  {label: 'About', href: 'https://bldrs.ai/about'},
  {label: 'Pricing', href: 'https://bldrs.ai/pricing'},
  {label: 'News', href: 'https://bldrs.ai/blog'},
]


/**
 * The bldrs.ai logo in the ProjectsDrawer footer; clicking it opens a
 * popup with the marketing pages (About / Pricing / News) and tagline.
 * Wireframe screen 4 of the conversational-CAD set
 * (design/new/conversational-cad.md §2.5). Account management joins this
 * popup with `identity-300`'s profile drawer — not duplicated here.
 *
 * @return {ReactElement}
 */
export default function LogoMenu() {
  const [anchorEl, setAnchorEl] = useState(null)

  return (
    <>
      {/* Plain logo mark at the default icon size, matching the
          AboutControl logo — the domain lockup at a custom size read as a
          second, oversized brand element. */}
      <IconButton
        onClick={(event) => setAnchorEl(event.currentTarget)}
        title='Bldrs'
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
    </>
  )
}
