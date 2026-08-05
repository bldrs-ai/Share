# E2E shared helpers

This directory holds **shared Playwright E2E helpers only** — not test
specs. Keep it that way.

- `formFactor.ts` — `describeMobileAndDesktop`: run a suite once per form
  factor (`[desktop]` / `[mobile]`) by flipping the viewport width.
- `models.ts` — `setupVirtualPathIntercept` (serve a repo fixture for a
  `/share/v/gh/...` model URL) and `waitForModelReady`.
- `utils.ts` — `homepageSetup`, returning-user/auth setup, snackbar/grace
  dismissal, and the rest of the page-bootstrap helpers.
- `homepage.ts`, `workspace.ts` — page-object-ish helpers for those areas.

## Put specs next to their subject, not here

A new E2E `*.spec.ts` belongs **next to the code it exercises**, so the
test travels with its subject and a reader finds it where they'd look:

| Subject | Put the spec in |
|---|---|
| A component | `src/Components/<Area>/` (e.g. `src/Components/Camera/permalinkCamera.spec.ts`) |
| A container / page-level flow | `src/Containers/` (e.g. `src/Containers/sceneHighlightPermalink.spec.ts`) |
| Engine / viewer internals with no component home | `src/viewer/` (e.g. `src/viewer/webIfcEngine.webifc.spec.ts`) |

Co-location is already the norm across `src/Components/**` — match it.
Only add files here when they are genuinely **shared** across specs.

## How this still works after co-locating

Both Playwright configs set `testDir: ../src` with a `**/*.spec.ts`
(and `**/*.webifc.spec.ts`) glob, so a spec anywhere under `src/` is
discovered — location is purely organizational.

Import the helpers by their path back to this directory, e.g. from a spec
in `src/Components/<Area>/`:

```ts
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
```

from `src/Containers/` or `src/viewer/` it's one fewer `..`
(`../tests/e2e/...`).
