# Bolt.new Integration

This repository integrates bolt.new as a subpath at `/build`.

## Local Development Setup

### Prerequisites

1. Clone the bolt.new fork alongside this repository:
   ```bash
   git clone https://github.com/bldrs-ai/bldrsbolt.new.git
   ```

2. Install dependencies in bolt.new:
   ```bash
   cd bldrsbolt.new
   pnpm install
   ```

### Environment Variables

Create a `.env` file in the root of this Share repository:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

> **⚠️ Important**: Never commit the `.env` file. Make sure it's in `.gitignore`.

### Syncing Bolt.new Files

The `sync-to-share.cjs` script builds bolt.new and copies the files into this repository:

```bash
# Sync using default path (../bldrsbolt.new)
yarn sync-bolt

# Or specify a custom bolt.new path
yarn sync-bolt /path/to/bldrsbolt.new

# Or use environment variable
BOLT_PATH=/path/to/bldrsbolt.new yarn sync-bolt
```

This script:
1. Builds bolt.new from the specified directory
2. Copies client files to `docs/build/`
3. Copies server function to `netlify/functions/server/`

### Running Locally

Start the development server:

```bash
# Sync bolt.new and start dev server in one command
yarn dev-with-bolt

# Or manually
yarn sync-bolt
netlify dev
```
Access Share at: `http://localhost:8888`
Access bolt.new at: `http://localhost:8888/build`

### How It Works

1. **Static Assets**: Files in `docs/build/assets/` are served directly by Netlify
2. **API Routes**: `/build/api/*` and `/build/chat/*` are routed to `netlify/functions/server`
3. **Bolt Pages**: Other `/build/*` routes are handled by the Remix SSR function
4. **Share SPA**: All other routes (`/*`) serve Share's `index.html`

### Netlify Configuration

The `_redirects` file contains:

```
# 1. Bolt static assets
/build/assets/*   /build/assets/:splat   200!

# 2. Bolt server routes
/build            /.netlify/functions/server   200
/build/*          /.netlify/functions/server   200

# 3. Share SPA fallback
/*                /index.html   200
```

## Deployment

### Setting Up Environment Variables

In Netlify dashboard:
1. Go to Site settings → Build & deploy → Environment
2. Add the API keys:
   - `GEMINI_API_KEY`
   - `ANTHROPIC_API_KEY`

Or via CLI:
```bash
netlify env:set GEMINI_API_KEY "your_key_here"
netlify env:set ANTHROPIC_API_KEY "your_key_here"
```

### Build Process

The deployment uses `netlify-share.toml` which:
1. Clones bolt.new into a temporary directory
2. Builds it with `pnpm run build`
3. Copies files to `docs/build/` and `netlify/functions/server/`
4. Deploys everything together

## Troubleshooting

### 204 No Content on Assets
Make sure the assets redirect has the `!` (force) flag and comes before the catch-all `/build/*` redirect.

### API Key Errors
Ensure the `.env` file exists in the Share repository (not just in bolt.new) when running `netlify dev`.

### Build Fails
Check that:
- The bolt.new path is correct
- Dependencies are installed in bolt.new (`pnpm install`)
- The build completes successfully (`pnpm run build` in bolt.new)

## File Structure

```
Share/
├── docs/
├──  └── _redirects
│   └── build/              # Bolt.new client files (copied by script)
│       ├── assets/
│       └── ...
├── netlify/
│   └── functions/
│       └── server/         # Bolt.new server function (copied by script)
├── sync-to-share.cjs       # Build and sync script
├── netlify.toml            # Production deployment config
└── .env                    # API keys (gitignored)
```