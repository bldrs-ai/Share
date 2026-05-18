# Bldrs.ai marketing site

Next.js (App Router) + MUI v5. Server-side rendered, statically exported to plain
HTML at build time — crawlers, social-card scrapers, and humans get the real page,
not an SPA shell.

This is a **sibling build** to the viewer SPA in `../src`. The viewer keeps its
esbuild pipeline; this site owns everything outside `/share/*`.

## Routes

| Path | Source |
|---|---|
| `/` | `src/app/page.tsx` — landing |
| `/about` | `src/app/about/page.tsx` |
| `/privacy` | `src/app/privacy/page.tsx` |
| `/tos` | `src/app/tos/page.tsx` |
| `/blog` | `src/app/blog/page.tsx` — auto-listed from `content/blog/*.mdx` |
| `/blog/<slug>` | `src/app/blog/[slug]/page.tsx` |
| `/sitemap.xml` | `src/app/sitemap.ts` |
| `/robots.txt` | `src/app/robots.ts` |
| `/feed.xml` | `src/app/feed.xml/route.ts` — RSS |

## Dev loop

```bash
cd marketing
yarn install        # or: npm install
yarn dev            # http://localhost:3000
yarn build          # emits ./out/ (static HTML)
yarn typecheck      # tsc --noEmit
yarn lint           # next lint
```

`yarn build` produces `out/` with one `index.html` per route. No Node server is
needed to serve the result.

## Adding a blog post

1. Create `content/blog/<YYYY-MM-DD-slug>.mdx`.
2. Frontmatter (required keys):
   ```yaml
   ---
   title: "Post title"
   date: "2026-05-01"
   description: "One-sentence summary — used for meta description, OG, RSS."
   author: "Name"
   category: "ai-update" | "company" | "tech"
   tags: ["tag1", "tag2"]
   ogImage: "/blog/post-slug-og.png"   # optional, defaults to /og-default.png
   ---
   ```
3. Write the body in MDX. Headings, lists, code blocks, links all map to the
   site's MUI typography automatically (see `src/components/MdxContent.tsx`).
4. `yarn build` picks it up — no code changes needed. The route, sitemap, and
   RSS feed all update.

The filename's `-` slug (minus `.mdx`) is the URL slug. Frontmatter `slug` is
ignored to keep filenames and routes in sync.

### AI-generated posts workflow

The recommended pipeline for the regular AI-update cadence:

1. Scheduled GitHub Action runs the generator → produces a new `.mdx` under
   `content/blog/`.
2. Action opens a PR with the new file.
3. Human reviewer edits/approves/merges.
4. Production rebuild emits the new post.

No CMS, no DB. PRs are the audit trail.

## SEO checklist

What this scaffold already delivers:

- ✅ Per-page `<title>`, meta description, canonical URL (`generateMetadata`).
- ✅ Open Graph + Twitter Card on every page.
- ✅ JSON-LD `SoftwareApplication` (about) and `Article` (blog posts).
- ✅ Auto-generated `sitemap.xml` and `robots.txt`.
- ✅ RSS at `/feed.xml`.
- ✅ Static HTML output — crawlers see real content, not a loading skeleton.

What still needs you:

- ⚠️ Drop a real `public/og-default.png` (1200×630). Currently referenced but
  not committed. Per-post `ogImage` overrides this.
- ⚠️ `SITE_URL` in `src/lib/site.ts` defaults to `https://bldrs.ai`. Override
  via `NEXT_PUBLIC_SITE_URL` at build time for staging deploys.
- ⚠️ Set up Google Search Console → submit the sitemap once deployed.

## Deploy

The marketing build outputs `out/` (static HTML); the viewer SPA outputs
`docs/` (also static). Both go under one domain via path-based routing.

**Netlify / Cloudflare Pages** (easiest):

```text
# netlify.toml or _redirects equivalent:
# 1. /share/* → SPA bundle (fallback index for client-side router)
# 2. everything else → marketing build
```

Build command (example):

```bash
yarn build                          # SPA → docs/
cd marketing && yarn build && cd .. # marketing → marketing/out/
# stage: copy marketing/out/* into a deploy folder, then docs/* under /share/
```

**GitHub Pages**: workable but messier — the existing SPA-on-GH-Pages 404
redirect hack in `../public/index.html` conflicts with marketing's static
HTML. Use a custom 404 only inside `/share/` if going this route.

Pick the platform and wire up a CI step; this scaffold is platform-agnostic.

## Why not extend the SPA's esbuild build?

- The SPA bundle pulls in Three.js, Conway WASM, web-ifc, Auth0, Sentry,
  Zustand, MUI. Marketing pages need none of it. Two builds = marketing pages
  are 50KB of HTML+CSS+font, not 5MB of viewer.
- esbuild has no first-class SSR. Helmet metadata stays runtime-only — invisible
  to crawlers and social-card scrapers, which is the whole point of the move.
- The viewer's global `overflow:hidden`/`position:fixed` body styling fights
  document-flow layouts. PR #1473's `MarketingLayout` worked around this in a
  `useEffect`. A separate build sidesteps the problem entirely.

## Why not a Next.js monorepo for both?

- Porting the Three.js + WASM + Conway pipeline into Next.js's webpack/Turbopack
  is multi-week work with zero SEO upside (the viewer doesn't need crawling).
- The SPA's bundling is tuned and stable; this scaffold keeps that intact.
