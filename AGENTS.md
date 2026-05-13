# CLAUDE.md

Bldrs Share — IFC/CAD model viewer in the browser, with multiple cloud sources (GitHub, Google Drive). React + MUI front end, Conway and web-ifc engines.

This file is the router for AI assistants working in this repo. Keep it small. Topic docs are linked below; read on demand, not eagerly.


## Always

- **Style:** match the surrounding code. Details in [STYLE.md](STYLE.md).
- **Commands:** never invoke `tsc` directly (it emits stray `.js`); use `yarn lint` (eslint + tsc) or `yarn typecheck`. For tests, `yarn test` (Jest) and `yarn test-flows [spec]` (Playwright). Full dev/CI loop in [PLAYBOOK.md](PLAYBOOK.md).
- **Run tests; don't ask first.** Use `--config tools/jest/jest.config.js` when invoking Jest directly.


## When to read what

| If you're working on… | Read |
|---|---|
| Module boundaries, top-level architecture | [DESIGN.md](DESIGN.md) |
| Render loop, `setRenderUpdate` seam, `?feature=perf` panel | [DESIGN.md](DESIGN.md) §"Render loop & perf monitor" |
| Code style, lint rules | [STYLE.md](STYLE.md) |
| Build, dev server, CI, Playwright setup | [PLAYBOOK.md](PLAYBOOK.md) |
| Asset pipeline, fonts, icons | [src/assets/README.md](src/assets/README.md) |
| Route schemas, URL parsing | [src/routes/README.md](src/routes/README.md) |
| Dev HTTPS certificate setup | [tools/esbuild/certificates/README.md](tools/esbuild/certificates/README.md) |
| Cloud sources, OAuth flows, token storage, Auth0 gate | [src/connections/README.md](src/connections/README.md) |
| Sharing PR3 (GitHub adapter) carry-over notes | [design/new/sharing-pr3-github.md](design/new/sharing-pr3-github.md) |

Anything not in this table is invisible to the router. When you create a doc that future assistants should consult, add a row above with a one-line "when to read" hint. Don't rely on filesystem discovery.


## Don't

- Don't `find -name "*.md"` to discover docs. Use the table.
- Don't read every linked doc at session start. Read the ones the task actually surfaces.
- Don't duplicate this file's content elsewhere — keep it small enough to stay in cache cheaply.
