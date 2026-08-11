import type {MetadataRoute} from 'next'
import {SITE_URL} from '@/lib/site'


// next build under `output: 'export'` needs this opt-in for the route to be
// emitted as a static file rather than expecting a runtime handler.
export const dynamic = 'force-static'


/**
 * Allow everything on the marketing build. The /share/* SPA is served by a
 * separate build, but lives under the same origin — we don't want to block
 * its assets from being indexed, only the routes themselves are dynamic.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{userAgent: '*', allow: '/'}],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
