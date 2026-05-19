import type {Metadata, Viewport} from 'next'
import {AppRouterCacheProvider} from '@mui/material-nextjs/v15-appRouter'
import ThemeRegistry from '@/components/ThemeRegistry'
import {INIT_SCRIPT} from '@/lib/colorMode'
import {
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
} from '@/lib/site'


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Smarter Building Together`,
    // Per-page `title` strings get the suffix applied automatically.
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{name: 'Bldrs, Inc.', url: SITE_URL}],
  openGraph: {
    type: 'website',
    locale: SITE_LOCALE,
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Smarter Building Together`,
    description: SITE_DESCRIPTION,
    images: [{url: OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME}],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Smarter Building Together`,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {index: true, follow: true},
  alternates: {
    canonical: SITE_URL,
    types: {'application/rss+xml': `${SITE_URL}/feed.xml`},
  },
  icons: {icon: '/favicon.ico'},
}

// Two theme-color entries let the browser chrome (mobile address bar) match
// whichever scheme actually renders, instead of being locked to night.
export const viewport: Viewport = {
  themeColor: [
    {media: '(prefers-color-scheme: dark)', color: '#0A0A0A'},
    {media: '(prefers-color-scheme: light)', color: '#ffffff'},
  ],
  width: 'device-width',
  initialScale: 1,
}


export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets data-color-mode on <html> before hydration so the first paint
            matches the cookie. Inline (not a chunk) to avoid a network round
            trip — the script body is ~250 bytes after minification. */}
        <script dangerouslySetInnerHTML={{__html: INIT_SCRIPT}}/>
      </head>
      <body>
        <AppRouterCacheProvider options={{key: 'mui'}}>
          <ThemeRegistry>{children}</ThemeRegistry>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
