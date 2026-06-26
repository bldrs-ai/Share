import {listBlogPosts} from '@/lib/blog'
import {SITE_DESCRIPTION, SITE_NAME, SITE_URL} from '@/lib/site'


// next build picks up a Route Handler under output:'export' only when it
// declares itself static. Without this, `next build` errors with
// "Page couldn't be rendered statically".
export const dynamic = 'force-static'


function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}


export async function GET(): Promise<Response> {
  const posts = await listBlogPosts()
  const now = new Date().toUTCString()

  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}`
      const pub = new Date(p.date).toUTCString()
      return `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pub}</pubDate>
      <category>${escapeXml(p.category)}</category>
      <description>${escapeXml(p.description)}</description>
    </item>`
    })
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)} — Blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-US</language>
    <lastBuildDate>${now}</lastBuildDate>${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {'content-type': 'application/rss+xml; charset=utf-8'},
  })
}
