# Bldrs.ai marketing site

Next.js (App Router) + MUI v5. Server-side rendered, statically exported to plain
HTML at build time — crawlers, social-card scrapers, and humans get the real page,
not an SPA shell.

This is a **sibling build** to the viewer SPA in `../src`. The viewer keeps its
esbuild pipeline; this site owns specific marketing routes (listed below).
**Root `/` stays with the SPA** — it redirects through react-router to the
homepage IFC model at `/share/v/p/index.ifc` and must not be claimed here.

## Routes

| Path | Source |
|---|---|
| `/about` | `src/app/about/page.tsx` — primary marketing landing |
| `/pricing` | `src/app/pricing/page.tsx` |
| `/services` | `src/app/services/page.tsx` |
| `/privacy` | `src/app/privacy/page.tsx` |
| `/tos` | `src/app/tos/page.tsx` |
| `/blog` | `src/app/blog/page.tsx` — auto-listed from `content/blog/*.mdx` |
| `/blog/<slug>` | `src/app/blog/[slug]/page.tsx` |
| `/sitemap.xml` | `src/app/sitemap.ts` |
| `/robots.txt` | `src/app/robots.ts` |
| `/feed.xml` | `src/app/feed.xml/route.ts` — RSS |

Routes that **don't** live here:

- `/` — SPA, redirects to the homepage IFC model
- `/share/*` — SPA (the viewer)

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

**Status:** not wired into the existing Netlify pipeline yet. The PR #1519
deploy preview only builds the SPA (per the root `netlify.toml`), so the new
marketing pages won't appear there until the build step below is added.

The marketing build outputs `out/` (static HTML); the SPA outputs `docs/`
(also static). Both go under one domain via path-based routing.

### Local preview

To verify the marketing build before wiring CI:

```bash
cd marketing
yarn install
yarn build                       # → marketing/out/
npx serve out                    # http://localhost:3000
```

### Netlify (suggested wiring)

The SPA's `netlify.toml` publishes `docs/`. To layer the marketing build on
top, extend the build to copy `marketing/out/*` into `docs/` after the SPA
build runs. Because every marketing route lands in its own subdirectory
(`/about/index.html`, `/pricing/index.html`, …), Netlify will serve those
static files first and only fall back to the SPA's `docs/index.html` for
unmatched routes (`/`, `/share/*`).

Add to the root `netlify.toml`:

```toml
[build]
  command = """
    yarn build && \\
    cd marketing && yarn install && yarn build && cd .. && \\
    cp -r marketing/out/* docs/
  """
  publish = "docs"
```

Because the marketing build does **not** emit `out/index.html`, copying
`out/*` into `docs/` does not clobber the SPA's `docs/index.html` — `/`
keeps its react-router-based redirect to the homepage IFC model.

### GitHub Pages

Workable but messier — the existing SPA-on-GH-Pages 404 redirect hack in
`../public/index.html` conflicts with marketing's static HTML. If going
this route, use a custom 404 only inside `/share/`.

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
