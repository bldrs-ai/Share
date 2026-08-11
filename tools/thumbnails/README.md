# Sample-model thumbnails

Generates the images the Open dialog's **Samples** tab shows on each
model card, by loading the model in Share's own viewer (headless
Chromium) and screenshotting it.

Rendering through the real app — rather than a standalone renderer — is
what makes every format work: IFC, STEP, FBX, PDB, OBJ, STL and GLB all
come in through one `src/loader/Loader.js` stack, so the thumbnail shows
exactly the materials, lighting and framing a user sees. A separate
renderer (conway's CLI, say) only speaks IFC and STEP.

## Regenerating

Needs a playwright-config build first — that build exposes `window.store`
(so the scene background can be cleared for transparency) and enables
`preserveDrawingBuffer`:

```
yarn test-flows-build
node tools/thumbnails/generate.mjs                 # all samples
node tools/thumbnails/generate.mjs --only Momentum # just one
```

Output lands in `public/static/thumbnails/<Name>.webp` — transparent,
512×512, ~10–20KB each. Review them as a diff like any other asset.

Models are cached under `cache/` (git-ignored) on first fetch, so
re-shoots cost no `test-models` LFS bandwidth.

## Aiming a thumbnail

The viewpoint comes from the `#c:` permalink camera on each entry in
`src/Components/Open/sampleModelRoster.js`. Open the sample in the app, orbit
to the angle you want, copy the `#c:...` fragment from the address bar
into that entry's `path`, and re-shoot with `--only <Name>`. The same
hash frames the model when a user opens the sample, so the thumbnail and
the first view a user gets stay in sync by construction.

Entries with no `#c:` fragment fall back to the viewer's auto-frame:
centred, but arbitrary in angle and often small in frame.

Note the generator normalizes *fill* on its own — it trims the
transparent border and re-pads to a fixed margin so every card carries
the same visual weight. The camera hash therefore controls the viewing
**angle**; you don't need to fuss with distance.

## Options

| flag | default | meaning |
|---|---|---|
| `--only A,B` | all | restrict to named samples |
| `--size` | 512 | output edge, px |
| `--margin` | 16 | transparent padding inside that edge, px |
| `--out` | `public/static/thumbnails` | output directory |
| `--port` | 8129 | port for the static server |

## Notes

- Each model renders in its own browser context. The viewer's wasm heap
  and OPFS state persist across in-page navigations, and after a couple
  of large models (SEESTRASSE alone is 25MB) later loads stopped
  reaching `data-model-ready`.
- The generator refuses to start if its port is occupied rather than
  silently rendering against another process's server.
- Models are staged into `docs/__test_fixtures__/` and served through
  MSW's `bldrs-ai/test-models` handler, whatever org they really live
  in; the staged copies are removed on exit.
