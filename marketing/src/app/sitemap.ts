import type {MetadataRoute} from 'next'
import {listBlogPosts} from '@/lib/blog'
import {SITE_URL} from '@/lib/site'


// next build under `output: 'export'` needs this opt-in for the route to be
// emitted as a static file rather than expecting a runtime handler.
export const dynamic = 'force-static'


/**
 * Static-export sitemap. Includes top-level marketing pages + every blog post.
 * The /share/* viewer routes are intentionally excluded — they're dynamic and
 * served by a separate build that doesn't want crawler attention.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listBlogPosts()
  const now = new Date().toISOString()

  const staticRoutes: MetadataRoute.Sitemap = [
    {url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1},
    {url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.9},
    {url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.9},
    {url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3},
    {url: `${SITE_URL}/tos`, lastModified: now, changeFrequency: 'yearly', priority: 0.3},
  ]

  const blogRoutes: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.date,
    changeFrequency: 'yearly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...blogRoutes]
}
