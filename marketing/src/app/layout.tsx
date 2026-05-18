import type {Metadata, Viewport} from 'next'
import {AppRouterCacheProvider} from '@mui/material-nextjs/v15-appRouter'
import ThemeRegistry from '@/components/ThemeRegistry'
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

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
}


export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider options={{key: 'mui'}}>
          <ThemeRegistry>{children}</ThemeRegistry>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
