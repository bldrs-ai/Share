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
node tools/models/makeIndexStep.mjs             # → public/index.step
node tools/models/makeIndexStep.mjs /tmp/x.step # → somewhere else
```

The default output resolves against the script, not the shell, so the
first form works from any directory — including `tools/models/` itself.

Then open `/share/v/p/index.step` and check it against
`/share/v/p/index.ifc` — **with a `#c:` camera on the URL**, not just
side by side. Both files occupy the same world-space box, so one camera
permalink frames both, which is how the landing page aims at the logo.
Auto-framing hides misalignment (it centres whatever it's given), so a
bare comparison of the two will look right even when they're 76m apart.

### The block order in `BLOCKS` is load-bearing

Conway's `COORDINATE_TO_ORIGIN` open puts a model's world origin at the
**first geometry the file emits**: one coordination matrix, derived from
that placement × the geometry's first vertex, reused for the whole model
(`compat/web-ifc/coordination_f64.deriveCoordinationF64`). A model's
world position therefore depends on which element its file happens to
declare first, and two files of the same object coincide only when they
agree on that.

So `BLOCKS` lists the logo in `index.ifc`'s declaration order — x=76
first, not the x=0 the eye expects. Sorting it "tidily" slides the STEP
model 76m down +X and silently breaks every camera permalink that spans
the two formats. `src/Containers/indexStepLogo.spec.ts` compares the two
models' world bounds and fails if that happens.

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
