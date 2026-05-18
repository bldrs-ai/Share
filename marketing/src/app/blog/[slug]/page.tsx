import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {Chip, Stack, Typography} from '@mui/material'
import PageShell from '@/components/PageShell'
import MdxContent from '@/components/MdxContent'
import {getBlogPost, listBlogPosts} from '@/lib/blog'
import {OG_IMAGE, SITE_NAME, SITE_URL} from '@/lib/site'


/**
 * Pre-render every blog post at build time. New posts under content/blog/*.mdx
 * get static routes on the next build — no code change needed.
 */
export async function generateStaticParams() {
  const posts = await listBlogPosts()
  return posts.map((p) => ({slug: p.slug}))
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{slug: string}>
}): Promise<Metadata> {
  const {slug} = await params
  const post = await getBlogPost(slug)
  if (!post) {
    return {title: 'Post not found'}
  }
  const url = `${SITE_URL}/blog/${post.slug}`
  const image = post.ogImage ? `${SITE_URL}${post.ogImage}` : OG_IMAGE
  return {
    title: post.title,
    description: post.description,
    alternates: {canonical: `/blog/${post.slug}`},
    openGraph: {
      title: `${post.title} — ${SITE_NAME}`,
      description: post.description,
      url,
      type: 'article',
      publishedTime: post.date,
      authors: post.author ? [post.author] : undefined,
      tags: post.tags,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${post.title} — ${SITE_NAME}`,
      description: post.description,
      images: [image],
    },
  }
}


function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}


export default async function BlogPostPage({
  params,
}: {
  params: Promise<{slug: string}>
}) {
  const {slug} = await params
  const post = await getBlogPost(slug)
  if (!post) {
    notFound()
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': post.title,
    'description': post.description,
    'datePublished': post.date,
    'author': post.author ? {'@type': 'Person', 'name': post.author} : undefined,
    'publisher': {
      '@type': 'Organization',
      'name': SITE_NAME,
      'url': SITE_URL,
    },
    'mainEntityOfPage': `${SITE_URL}/blog/${post.slug}`,
    'image': post.ogImage ? `${SITE_URL}${post.ogImage}` : OG_IMAGE,
  }

  return (
    <PageShell>
      {/* JSON-LD as a plain inline <script> — see about/page.tsx for rationale. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />

      <Stack direction="row" spacing={2} alignItems="center" sx={{mb: 2}}>
        <Typography variant="body2" sx={{opacity: 0.65}}>
          {formatDate(post.date)}
        </Typography>
        <Chip
          label={post.category}
          size="small"
          color={post.category === 'company' ? 'primary' : 'secondary'}
          variant="outlined"
        />
        {post.author && (
          <Typography variant="body2" sx={{opacity: 0.65}}>
            by {post.author}
          </Typography>
        )}
      </Stack>

      <Typography variant="h1" component="h1" sx={{mb: 4}}>
        {post.title}
      </Typography>

      <MdxContent source={post.body}/>
    </PageShell>
  )
}
