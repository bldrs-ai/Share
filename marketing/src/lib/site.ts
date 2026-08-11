/**
 * Site-wide constants. Used by metadata, sitemap, robots, and RSS.
 *
 * `SITE_URL` must be the absolute origin (no trailing slash) — every OG tag,
 * canonical link, sitemap entry, and RSS guid expands from it. Override at
 * build time with `NEXT_PUBLIC_SITE_URL` for staging deploys.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://bldrs.ai'

export const SITE_NAME = 'Bldrs.ai'

export const SITE_TAGLINE = 'Smarter Building Together'

export const SITE_DESCRIPTION =
  'Bldrs.ai is a browser-first BIM & CAD collaboration platform. ' +
  'Open IFC, STEP, STL, OBJ, and GLTF models directly in the web, powered ' +
  'by the open-source Conway engine.'

export const SITE_KEYWORDS = [
  'IFC viewer',
  'STEP viewer',
  'BIM viewer',
  'CAD viewer',
  'Digital Twins',
  'browser CAD',
  'open source CAD',
  'Conway engine',
  'AEC collaboration',
  'GitHub for CAD',
]

export const SITE_LOCALE = 'en_US'

export const OG_IMAGE = `${SITE_URL}/og-default.png`

export const SOCIAL = {
  github: 'https://github.com/bldrs-ai',
  githubShare: 'https://github.com/bldrs-ai/Share',
  discord: 'https://discord.gg/9SxguBkFfQ',
  linkedin: 'https://www.linkedin.com/company/bldrs-ai',
  twitter: 'https://twitter.com/bldrs_ai',
  contact: 'mailto:info@bldrs.ai',
  sales: 'mailto:hello@bldrs.ai',
  services: 'mailto:services@bldrs.ai',
} as const

/** Where the viewer SPA lives. Marketing pages link here for "Launch app". */
export const VIEWER_PATH = '/share'

/** Top-of-site navigation. The marketing site owns these paths. */
export const NAV_ITEMS: ReadonlyArray<{label: string; path: string}> = [
  {label: 'About', path: '/about'},
  {label: 'Pricing', path: '/pricing'},
  {label: 'Services', path: '/services'},
  {label: 'Blog', path: '/blog'},
]
