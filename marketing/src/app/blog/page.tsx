import type {Metadata} from 'next'
import Link from 'next/link'
import {Box, Chip, Stack, Typography} from '@mui/material'
import PageShell from '@/components/PageShell'
import {listBlogPosts} from '@/lib/blog'
import {SITE_NAME, SITE_URL} from '@/lib/site'


const TITLE = 'Blog'
const DESCRIPTION =
  'Tech talks, AI updates for market events, and company news from Bldrs.ai.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: '/blog',
    types: {'application/rss+xml': `${SITE_URL}/feed.xml`},
  },
  openGraph: {
    title: `${TITLE} — ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} — ${SITE_NAME}`,
    description: DESCRIPTION,
  },
}


function formatDate(iso: string): string {
  // timeZone: 'UTC' keeps the rendered date deterministic. These pages are
  // statically prerendered, so without it the output would depend on the
  // build machine's local zone: `new Date('2024-12-05')` is UTC midnight, and
  // a build west of UTC would render the previous day ('December 4').
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}


export default async function BlogIndexPage() {
  const posts = await listBlogPosts()
  return (
    <PageShell title={TITLE}>
      <Typography variant="body1" sx={{mb: 5, opacity: 0.85}}>
        {DESCRIPTION}
      </Typography>

      <Stack spacing={4} component="ul" sx={{listStyle: 'none', p: 0, m: 0}}>
        {posts.map((post) => (
          <Box
            key={post.slug}
            component="li"
            sx={{borderBottom: 1, borderColor: 'divider', pb: 4, '&:last-child': {borderBottom: 0}}}
          >
            <Stack direction="row" spacing={2} alignItems="center" sx={{mb: 1}}>
              <Typography variant="body2" sx={{opacity: 0.65}}>
                {formatDate(post.date)}
              </Typography>
              <Chip
                label={post.category}
                size="small"
                color={post.category === 'company' ? 'primary' : 'secondary'}
                variant="outlined"
              />
            </Stack>
            <Typography
              variant="h3"
              component="h2"
              sx={{
                mb: 1,
                '& a': {color: 'text.primary', textDecoration: 'none'},
                '& a:hover': {color: 'primary.main'},
              }}
            >
              <Link href={`/blog/${post.slug}`}>{post.title}</Link>
            </Typography>
            <Typography variant="body1" sx={{opacity: 0.85}}>
              {post.description}
            </Typography>
          </Box>
        ))}
      </Stack>
    </PageShell>
  )
}
