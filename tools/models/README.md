# Generated demo models

Hosted demo models that are **generated, not authored** — the generator
is the source you edit, the model file is a build product that happens to
be committed (so `/share/v/p/...` serves it with no build step).

## `index.step` — the logo, in STEP

`public/index.step` is the STEP twin of `public/index.ifc`, the Bldrs
logo the homepage loads. It exists so the `/viewer/step` SEO landing page
(roadmap epic `grow-100`) has a default "see it in the viewer" target in
the format the page is about — landing a STEP search on an IFC model is a
bounce.

```
node tools/models/makeIndexStep.mjs            # → public/index.step
node tools/models/makeIndexStep.mjs /tmp/x.step # → somewhere else
```

Then open `/share/v/p/index.step` and check it against
`/share/v/p/index.ifc`. Both files occupy the **same world-space box**
(the STEP is millimetre-unit with ×1000 coordinates), so a `#c:` camera
permalink can be moved between them unchanged — which is how the landing
page aims at the logo.

Two things to know about the twin; `makeIndexStep.mjs`'s header comment
has the detail:

- **Seven blocks, two parts.** The blocks are occurrences of two reusable
  part shapes, wired with `NEXT_ASSEMBLY_USAGE_OCCURRENCE`. That's STEP's
  native idiom and makes the file a small, fast regression asset for
  occurrence-keyed selection (design/new/step-occurrence-selection.md) —
  the NIST `as1` assembly is the only other one we have, and it's ~90s to
  load.
- **Blocks are lime, one colour each**, which is what the IFC *renders*
  even though it also carries a per-face grey. Conway resolves AP214
  `styled_item`s per representation item, so a per-face colour has
  nowhere to land anyway.

Covered end-to-end by `src/Containers/indexStepLogo.spec.ts`.
