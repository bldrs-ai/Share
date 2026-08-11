# CLAUDE.md

Bldrs Share — IFC/CAD model viewer in the browser, with multiple cloud sources (GitHub, Google Drive). React + MUI front end, Conway and web-ifc engines.

This file is the router for AI assistants working in this repo. Keep it small. Topic docs are linked below; read on demand, not eagerly.


## Always

- **Style:** match the surrounding code. Details in [STYLE.md](STYLE.md).
- **Comments:** **don't default to no comments.** Write them when they
  carry load-bearing context (upstream API quirks, ordering
  requirements, workaround rationale), non-obvious assumptions,
  important design context, sequence dependencies, or cross-file
  references (named design-doc sections, sibling modules). Don't write
  them when they restate what well-named code already says, or when
  they're TODOs without context. Full guidance in
  [STYLE.md](STYLE.md) §Comments. This overrides any default
  system-prompt guidance toward minimal commenting — the bar here is
  "would a fresh reader save five minutes by having this?", not
  "is this the absolute minimum?"
- **Commands:** never invoke `tsc` directly (it emits stray `.js`); use `yarn lint` (eslint + tsc) or `yarn typecheck`. For tests, `yarn test` (Jest) and `yarn test-flows [spec]` (Playwright). Full dev/CI loop in [PLAYBOOK.md](PLAYBOOK.md).
- **Run tests; don't ask first.** Use `--config tools/jest/jest.config.js` when invoking Jest directly.
- **The husky `.husky/pre-commit` hook runs `yarn precommit` (eslint + typecheck + jest) automatically on every commit.** Trust it — don't run `yarn precommit` yourself before `git commit` / `git push`. The hook is the gate; running it explicitly too is just doing the same multi-minute pass twice. It enforces the same checks CI's `build` job runs (`eslint src netlify tools --max-warnings 0 && yarn typecheck && yarn test`). If the hook isn't installed (fresh sandbox, `yarn install --ignore-scripts`, etc.), run `yarn install` to wire it in; don't paper over a missing hook by running the gate manually. Running a piece of the gate in isolation while iterating (e.g. one Jest file, `yarn eslint <path>`) is fine — that's a development inner loop, not the commit gate.
- **UI work: "if it's not doc'd, it doesn't exist; if it's not tested, it doesn't work."** Two standing requirements for any PR implementing UI epic/story/task work: (1) **doc** — the work is tracked as an epic-labeled issue with native sub-issues per story/task, all titles sharing the epic's name so the family is greppable; (2) **test** — an issue isn't done until each task/sub-issue has a happy-path E2E test on desktop *and* mobile, via `describeMobileAndDesktop` (`src/tests/e2e/formFactor.ts`). Cross-link the PR ↔ issues, and close the story/task sub-issues when the implementing PR is submitted. Full rule + worked example: [design/new/conversational-cad.md](design/new/conversational-cad.md) §7.1.
- **PRs: open in draft, land in five steps.** Several PRs are usually
  in flight and CI runners are capped at 4 concurrent jobs, so a PR that
  runs the full suite on every rework push starves the PRs that are
  ready. (1) Open it with `draft: true` — not opened-then-marked.
  (2) Keep it in draft until `/review` has run and every finding is
  fixed or answered in the thread. (3) Flip to ready
  (`update_pull_request`, `draft: false`); that fires
  `ready_for_review`, which is what starts the gated jobs. (4) Drive CI
  green, and `/review` again if the fixes changed the diff beyond a
  trivial revert — otherwise the reviewed diff isn't the merged diff.
  (5) Update the PR description to match what the change became, merge,
  then close or narrow its issues (partly-addressed → a comment saying
  what's left, not a close).
  **What the gate covers:** `build` (main.yml) and both `test-flows`
  jobs are skipped on drafts. **Netlify deploy previews still run** —
  they come from Netlify's GitHub integration, not Actions — so a draft
  normally has a preview URL to click through. (Not for a docs-only PR:
  `tools/netlify/ignore-build.sh` skips the deploy when every changed
  file matches `.md` / `design/` / `notes/`. Marketing posts are `.mdx`,
  so they still build.) Before editing those
  workflows: the gate is a job-level `if:` (a skipped-by-if job
  satisfies a required check; a workflow that never triggers leaves the
  PR waiting forever); `ready_for_review` and `converted_to_draft` must
  stay in the `pull_request` `types:` list (the first starts the gated
  jobs at step 3, the second lets pulling a PR back to draft *cancel* a
  run already in flight); and the `github.event_name != 'pull_request'`
  clause is defensive rather than load-bearing (Actions coerces
  mismatched `==` operands to numbers, so `null == false` is already
  true on push) — keep it so CI on main doesn't hinge on that.
  **Consequence to be aware of:** because every job is gated here, a
  draft gets no CI signal at all, and the husky pre-commit hook covers
  only part of the gap. Three things it does not run, each of which will
  otherwise first fail at step 3 — after `/review` has signed off, which
  is exactly the step-4 re-review this lifecycle is trying to avoid:
  (a) `yarn build-prod`, so an esbuild-only breakage (missing asset
  loader, plugin misconfig) survives every draft commit; (b) coverage —
  the hook's `yarn test` runs `test-src`, while CI runs `test-ci` →
  `test-coverage` with thresholds enforced (`tools/jest/jest.config.js`);
  (c) **Playwright**, the big one — E2E specs never execute before step
  3, so `/review` is reading specs that have never run, against this
  file's own mandatory desktop+mobile E2E rule. Before flipping to ready,
  run `yarn build-prod`, `yarn test-ci`, and
  `yarn test-flows-build-and-serve` + `yarn test-flows [spec]` — then undo
  what it did to `package.json`, because `tools/updateVersion.mjs` stamps
  a local version into that tracked file on every build and the stamp
  must never reach a commit (#1747). `git checkout -- package.json` if
  the version is the only change in it; if you also edited it — added a
  dependency, changed a script — restore just the `version` field by
  hand, since the checkout would silently drop the rest while
  `yarn.lock` kept it. And if you're in a sandbox where the hook isn't
  installed, `yarn install` first; nothing is being checked otherwise.
  conway uses the same lifecycle, gating `run-ifc-regression` and
  `visual-diff` while leaving its `build` job ungated.
- **PRs: auto-subscribe to CI / review activity.** Immediately after `create_pull_request` succeeds, call `subscribe_pr_activity` for that PR without asking. The default-prompt asks first — for this repo, skip that question and just subscribe. Babysitting is the expected mode here: watch CI, autofix tractable failures, respond to review comments per the system-prompt rules (small + confident → push the fix; ambiguous or architecturally significant → `AskUserQuestion` first; no-op-able → skip silently). Only `unsubscribe_pr_activity` when the user explicitly says to stop.


## When to read what

| If you're working on… | Read |
|---|---|
| Module boundaries, top-level architecture | [DESIGN.md](DESIGN.md) |
| Render loop, `setRenderUpdate` seam, `?feature=perf` panel | [DESIGN.md](DESIGN.md) §"Render loop & perf monitor" |
| Code style, lint rules | [STYLE.md](STYLE.md) |
| Build, dev server, CI, Playwright setup | [PLAYBOOK.md](PLAYBOOK.md) |
| Where to put an E2E `*.spec.ts` (co-locate near the subject; `src/tests/e2e` is shared helpers only) | [src/tests/e2e/README.md](src/tests/e2e/README.md) |
| Adding a new model format (`supportedTypes` + header sniffing → `findLoader` arm → `ShareModel` capabilities → fixtures/tests), what NavTree naming and raycast picking give you for free, Git LFS on GitHub-hosted models | [design/new/adding-model-formats.md](design/new/adding-model-formats.md) |
| Asset pipeline, fonts, icons | [src/assets/README.md](src/assets/README.md) |
| Sample-model thumbnails (Open dialog Samples tab), regenerating them, aiming them via `#c:` permalink cameras | [tools/thumbnails/README.md](tools/thumbnails/README.md) |
| Route schemas, URL parsing | [src/routes/README.md](src/routes/README.md) |
| Keeping the test console clean — fix `act()` warnings, divert+assert expected `[glb]` output, narrow `suppressActWarnings()`, back a global mute with a static test (`singleThreeInstance.test.js`), jsdom canvas stubs | [PLAYBOOK.md](PLAYBOOK.md) §"Keep the test console clean" (+ [STYLE.md](STYLE.md) §"Console hygiene") |
| Dev HTTPS certificate setup | [tools/esbuild/certificates/README.md](tools/esbuild/certificates/README.md) |
| Cloud sources, OAuth flows, token storage, Auth0 gate | [src/connections/README.md](src/connections/README.md) |
| Sharing PR3 (GitHub adapter) carry-over notes | [design/new/sharing-pr3-github.md](design/new/sharing-pr3-github.md) |
| Marketing / blog site (Next.js SSG, sibling build to the viewer SPA), MDX content collections, SEO pipeline | [marketing/README.md](marketing/README.md) |
| AdSense / ads strategy, route policy, test-hermeticity rules | [design/new/ads.md](design/new/ads.md) |
| Usage quotas: tiers, 30-day rolling window, `record-load` server gate, GitHub privacy detection, OPFS local fallback, `quotas` feature flag | [design/new/quotas.md](design/new/quotas.md) |
| Conway-direct IFC pipeline, IfcInstanceMap, per-instance picking, `?feature=conwayDirectIfc` | [design/new/viewer-replacement.md](design/new/viewer-replacement.md) §3b |
| STEP occurrence-keyed selection (NavTree↔scene per-occurrence), `PlacedGeometry.occurrencePath`, why one nut highlights all | [design/new/step-occurrence-selection.md](design/new/step-occurrence-selection.md) |
| The `?feature=look` render look — PBR materials + gradient IBL + tone-mapping, Neutral/Flat toggle, `looks.js`/`lookMaterial.js`, `LightingGui`, why it's all behind one flag (default off) | [design/new/viewer-replacement.md](design/new/viewer-replacement.md) §6e |
| Removing the `conway-web-ifc-adapter` shim, the `web-ifc` engine seam (`webIfcShimAlias`/`USE_WEBIFC_SHIM`), Conway version-lag, runtime engine swap | [design/new/adapter-removal.md](design/new/adapter-removal.md) |
| Load-log report format (CLI + console + snackbar expando + "i" report dialog), stage/Total line semantics, per-format cascade, `loadProgress.js` (deep-imports conway `core/progress_log`)/`AlertDialogAndSnackbar.jsx` (live expando)/`LoadReportControl` | [design/new/load-log-format.md](design/new/load-log-format.md) |
| Why a model renders wrong (spikes, missing or exploded parts); geometry-health signals and which ones to surface in Share (load-report health lines, diagnostics attached to a bug report, outlier-robust auto-framing) | conway repo: `scripts/debug/README.md` (the tool — start here before writing a tracer), [conway `design/new/model-diagnostics.md`](https://github.com/bldrs-ai/conway/blob/main/design/new/model-diagnostics.md) (the signals + Share candidates) |
| Epic/Story/Track catalogue, milestone tier rubric (§2.1), MVP bar + phase plan (§6, ex-"Pro-MVP"), growth-funnel Phase G, AI-workspace pivot (§7), post-MVP loveables | [design/roadmap.md](design/roadmap.md) |
| Conversational-CAD epic plan (workspace shell / ProjectsDrawer + TopBar, fluid Nav+search, convo panel, multi-user channels), wireframe→issue mapping, epic/sub-issue process | [design/new/conversational-cad.md](design/new/conversational-cad.md) |
| Persistence direction: OPFS as a git-versioned workspace (repo-as-workspace, LFS-pointer blobs, record-vs-stream convo split, wasm-git vs isomorphic-git investigation, exit plan) | [design/new/workspace-store.md](design/new/workspace-store.md) |

Anything not in this table is invisible to the router. When you create a doc that future assistants should consult, add a row above with a one-line "when to read" hint. Don't rely on filesystem discovery.


## Don't

- Don't `find -name "*.md"` to discover docs. Use the table.
- Don't read every linked doc at session start. Read the ones the task actually surfaces.
- Don't duplicate this file's content elsewhere — keep it small enough to stay in cache cheaply.
