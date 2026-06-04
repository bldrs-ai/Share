import path from 'node:path'
import {fileURLToPath} from 'node:url'


const __dirname = path.dirname(fileURLToPath(import.meta.url))


/**
 * Marketing/blog build. Emits static HTML to `out/` via `next build`.
 *
 * Path-based routing: this site owns everything except /share/*, which is
 * served by the legacy esbuild SPA. The two builds are stitched at deploy
 * time — see marketing/README.md.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  // Hosts that don't run a Node server (GitHub Pages, plain S3) need each
  // route to resolve to a directory with index.html — `/about/` → `/about/index.html`.
  trailingSlash: true,
  // next/image's default loader needs a runtime; static export rules it out.
  images: {unoptimized: true},
  reactStrictMode: true,
  // Without this, Next walks up to the repo root and picks the SPA's
  // yarn.lock + tsconfig + eslint config as the "workspace root", which
  // pulls eslint-config-google into the marketing build by accident.
  outputFileTracingRoot: __dirname,
  // .mdx files are read at build time via gray-matter + next-mdx-remote,
  // not via next's MDX plugin, so no pageExtensions override is needed.
}

export default nextConfig
