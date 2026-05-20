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

The marketing build is chained into the root SPA build, not a sibling
process. `yarn build` runs `build-share` → `build-marketing`
(`tools/marketing/build.js`), which:

1. `yarn install --frozen-lockfile` inside `marketing/`.
2. `yarn build` inside `marketing/` → `marketing/out/`.
3. `cpSync('marketing/out', 'docs', {recursive: true})` to overlay.

The same script runs for `yarn serve` (the dev loop already builds the
SPA before serving — marketing piggybacks on that), and for Netlify
deploys via `netlify.toml`. One pipeline, no dev↔prod drift.

Marketing routes land in their own subdirectories
(`/about/index.html`, `/pricing/index.html`, …). Netlify (and the dev
proxy) resolve static files before consulting `public/_redirects`, so
those win as 200 pre-rendered HTML. `public/_redirects` carries an
explicit SPA allowlist (`/share/*`, `/ipsum`, `/popup-auth`,
`/popup-callback`) so unmatched paths 404 instead of returning the SPA
shell with HTTP 200 — a soft-404 SEO trap. Add a new entry there when
adding a top-level SPA route; both Netlify and `tools/esbuild/proxy.js`
read the same file via `tools/netlify/redirects.js`.

The marketing build deliberately emits no `out/index.html` (root
`page.tsx` was removed), so the overlay does not clobber the SPA's
`docs/index.html` — `/` keeps its react-router redirect to the
homepage IFC model.

### Local preview options

Marketing-only iteration with HMR (no viewer):

```bash
cd marketing
yarn install
yarn dev                         # http://localhost:3000
```

Full prod-shape preview (viewer + marketing, merged tree):

```bash
yarn serve                       # builds both, serves on :8080
```

Just the marketing static export, no viewer:

```bash
cd marketing && yarn build
npx serve out                    # http://localhost:3000
```

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
