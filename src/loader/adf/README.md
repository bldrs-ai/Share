# Align ADF (vendored)

Parser and three.js loader for Align Technology ClinCheck / Invisalign `.adf`
files (`AlignDataFile ( bin )`). Vendored from
[pablo-mayrgundter/freality#17](https://github.com/pablo-mayrgundter/freality/pull/17),
`bio/med/dental/src/`. The format write-up (container layout, tooth fields,
the MetaStream crown meshes) is in that directory's README.

| File | Upstream |
|---|---|
| `adf-parser.js` | `src/adf-parser.js`, with the unused `splinePoints` removed |
| `ADFLoader.js` | `src/ADFLoader.js`, with the unused `normals` array removed |
| `mesh-sidecar.js` | `src/mesh-sidecar.js`, with the per-mesh bbox read hoisted into `readVec3` (`no-loop-func`) |

Beyond those, the only changes are `eslint --fix` rewrites (semicolons, braces,
spacing). The rules that `--fix` can't satisfy are relaxed for this directory in
`.eslintrc.cjs`.

**Re-syncing:** copy the upstream files over these, run
`yarn eslint --fix src/loader/adf`, delete the empty `/** */` stubs `--fix`
inserts, then re-apply the three edits above.

Share-side glue (the `findLoader` wrapper and the fixup) is in
`src/loader/adf.js`, not here, so this directory stays a copy of upstream.

The real crown surfaces are MetaStream meshes, decoded by Share's own
`src/loader/mts/` and passed in through `ADFLoader#parse(buffer, {meshes})`
(see `src/loader/adf.js` and
[design/new/adf-mts-decoder.md](../../../design/new/adf-mts-decoder.md)).
Upstream's proxies still draw any tooth whose stream fails to decode.
