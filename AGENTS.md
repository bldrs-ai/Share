# CLAUDE.md

Bldrs Share — IFC/CAD model viewer in the browser, with multiple cloud sources (GitHub, Google Drive). React + MUI front end, Conway and web-ifc engines.

This file is the router for AI assistants working in this repo. Keep it small. Topic docs are linked below; read on demand, not eagerly.


## Always

- **Style:** match the surrounding code. Details in [STYLE.md](STYLE.md).
- **Commands:** never invoke `tsc` directly (it emits stray `.js`); use `yarn lint` (eslint + tsc) or `yarn typecheck`. For tests, `yarn test` (Jest) and `yarn test-flows [spec]` (Playwright). Full dev/CI loop in [PLAYBOOK.md](PLAYBOOK.md).
- **Run tests; don't ask first.** Use `--config tools/jest/jest.config.js` when invoking Jest directly.
- **The husky `.husky/pre-commit` hook runs `yarn precommit` (eslint + typecheck + jest) automatically on every commit.** Trust it — don't run `yarn precommit` yourself before `git commit` / `git push`. The hook is the gate; running it explicitly too is just doing the same multi-minute pass twice. It enforces the same checks CI's `build` job runs (`eslint src netlify tools --max-warnings 0 && yarn typecheck && yarn test`). If the hook isn't installed (fresh sandbox, `yarn install --ignore-scripts`, etc.), run `yarn install` to wire it in; don't paper over a missing hook by running the gate manually. Running a piece of the gate in isolation while iterating (e.g. one Jest file, `yarn eslint <path>`) is fine — that's a development inner loop, not the commit gate.


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
