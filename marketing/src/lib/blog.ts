import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'


/**
 * Blog post categories drive the /blog filter UI and RSS categorization.
 * Add a new value here when introducing a new content stream (e.g. 'release').
 */
export type BlogCategory = 'ai-update' | 'company' | 'tech'

export interface BlogFrontmatter {
  title: string
  slug: string
  date: string
  description: string
  author?: string
  category: BlogCategory
  tags?: string[]
  ogImage?: string
}

export interface BlogPost extends BlogFrontmatter {
  /** Raw MDX source — compiled per-page by next-mdx-remote. */
  body: string
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog')

/** All posts, newest-first. Read at build time (RSC + generateStaticParams). */
export async function listBlogPosts(): Promise<BlogPost[]> {
  const entries = await fs.readdir(CONTENT_DIR)
  const mdxFiles = entries.filter((f) => f.endsWith('.mdx'))
  const posts = await Promise.all(
    mdxFiles.map(async (file) => {
      const source = await fs.readFile(path.join(CONTENT_DIR, file), 'utf8')
      const {data, content} = matter(source)
      const fm = data as BlogFrontmatter
      // Trust the filename, not the frontmatter, for the URL slug — keeps
      // routes and frontmatter from drifting if someone edits one but not
      // the other.
      const slug = file.replace(/\.mdx$/, '')
      return {...fm, slug, body: content}
    }),
  )
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const posts = await listBlogPosts()
  return posts.find((p) => p.slug === slug) ?? null
}
