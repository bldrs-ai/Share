# Adding a model format

What it takes to teach Share a new file format, in the order the code
runs. Derived from the USD/USDA/USDC/USDZ addition
([#1728](https://github.com/bldrs-ai/Share/issues/1728) /
[#1729](https://github.com/bldrs-ai/Share/pull/1729)); the ADF, FBX,
OBJ, STL, PDB and XYZ formats sit on the same seams.

The short version: if a three.js loader exists for the format, the work
is one entry in `supportedTypes`, one arm in `findLoader`, one line in
`ShareModel`, and the tests. Everything else — NavTree names, picking,
the Open dialog, routing, drag-drop — follows automatically from those.


## 1. Declare the extension — `src/Filetype.js`

Add it to `supportedTypes`. That list is the single source of truth for
several things that would otherwise each need their own list:

| Consumer | Why it keys off `supportedTypes` |
|---|---|
| `src/routes/*` | `splitAroundExtension` splits `/share/v/gh/...` paths into (model file, element path) |
| `Components/Open/GitHubFileBrowser` | `pathSuffixSupported` filters the browsable file list |
| `Containers/CadView` | `fileSuffixBoundaryRegex` finds the model file inside a permalink |
| `utils/dragAndDrop` | routes a dropped file to the right loader |

**Prefix trap.** `typeRegexStr` sorts alternatives longest-first
because regex alternation is first-match: with `usd` ahead of `usda`,
`getValidExtension('model.usda')` returns `usd` and the file loads
under the wrong tag. Any new extension that is a prefix of, or
prefixed by, an existing one relies on that sort — keep it, and add a
longest-match test.

**Content sniffing.** Extension-less uploads (drag-drop, `/v/new/`)
resolve through `analyzeHeader` / `analyzeHeaderStr`. Add a magic-byte
check for a binary format (`matchesMagic`) or a prefix check for a text
one. Order matters: binary checks run before the UTF-8 decode, and
within `analyzeHeaderStr` the more specific patterns must precede the
loose numeric ones (OBJ/XYZ match nearly any numeric text).

A format with no magic at all may still have a structural signature.
Binary STL's 80-byte header is free text (all zeros, a part name,
Materialise's `COLOR=`), so it is recognized by its triangle count
accounting for the file to the byte — which needs the whole file's
size, passed as `analyzeHeader`'s `fileByteLength` (from `File.size`,
or a Range response's `Content-Range`). Without it that check is
skipped (test-models#69).

Be conservative. A sniff that is too broad silently swallows unrelated
uploads: gating `usdz` on a bare `PK` zip signature would have
classified every `.docx` and `.zip` as a model, turning a clean
"unknown type" alert into a parse failure deep inside the loader. The
USDZ check therefore also requires the archive's first entry to be a
`.usd*` layer — the rule the USDZ spec mandates and the loader
enforces.

**A compression envelope is not a format**, and must not be added as
one. `.glb.gz` opens (#1831), and it has no `supportedTypes` entry, no
`findLoader` arm and no `ShareModel` capability — it would poison all
three, since every one of them answers a question about the MODEL. What
it has instead is `loader/gzipEnvelope.js`, which takes the envelope off
at two seams — before an upload reaches OPFS, and once more in
`Loader#load` for the paths that skip that — so everything downstream
only ever sees the `glb` inside. `analyzeHeader` looks through one gzip
member and reports what is under it; `getValidExtension` strips one
trailing `.gz`. The exception that proves it: `.spz` IS a gzip stream,
so it is checked first and passed through compressed. Full reasoning,
including which paths a `.glb.gz` still cannot take:
[glb-export-premium.md](glb-export-premium.md) §4.7. A zip archive is
the same idea, but for a container: see §"An archive is not a format
either", below.


## An archive is not a format either: `.zip` and `.ifczip`

Half of the uploads the Open dialog rejected in the 2026-11-01 triage were
archives (bldrs-ai/ops#26), mostly named as if a format Share opens was
inside (`part.stp.zip`, `… ifc.zip`, download bundles). Share#2006 opens
the model inside, on the gzip envelope's pattern: no `zip` entry in
`supportedTypes`, no `findLoader` arm, nothing downstream that knows. The
difference is that a zip is a **container**: it can hold no model, one, or
several, so the upload seam can end in a refusal or a question as well as
a file.

Two modules. `loader/zipArchive.js` is the format — the central directory
(zip64 included) and the inflate of one entry, through three's vendored
fflate `Inflate`, so no new dependency. `loader/modelArchive.js` is the
policy — which entry is the model, and what each seam is told.

**The seams.** `utils/dragAndDrop.js#handleFileDrop` and
`utils/loader.js#loadLocalFile`, each right after
`inflateIfGzipEnvelope`, through `openUploadThroughArchive`. A file that is
not a zip reaches the seam's own open exactly as before, untyped. An entry
taken out of a zip reaches it as a `File` named for the entry (`Tower.ifc`,
which recents and the load report show) and *typed by the entry's
extension*, which is what chose it. A header sniff would disagree on formats
it can't recognize, such as `.gltf` or an ASCII STL that doesn't start with
`solid`. OPFS then holds `<uuid>.ifc`, which really is an IFC.

**What counts as a zip.** The `PK\x03\x04` header, or the `PK\x05\x06` an
empty archive is made of; the name alone never decides. A renamed zip
(`download`, `model.ifc`) still opens, and a `.zip` that isn't one is
refused as an unknown type. Some zips are models in their own right and
pass through untouched: anything `analyzeHeader` already recognizes (USDZ
and SOG by their first entry, and a binary STL whose free-form header
happens to start `PK`, by its triangle count), and a `.usdz` or `.sog` by
name. A `.docx` is a zip too. It is read, and its own guidance
(`NOT_A_MODEL`) still wins in the dialog. If it embeds a `.glb`, as Office's
3D models do, that `.glb` opens.

**Which entries are models.** An entry is a model when its extension is in
`supportedTypes` *exactly*. That is deliberately not `isExtensionSupported`,
whose unanchored match reads `ifcxml` as `ifc`. A 0-byte entry is never
a model: fflate inflates an empty stream to nothing without complaint.
Folders are skipped, and so is Finder's `__MACOSX/` and `._name` metadata,
which carries model extensions. A Windows tool's `folder\model.ifc` reads
as a folder. One model opens straight away. Several put up the **entry
chooser**: an `archiveEntryChoice` alert that AlertDialog renders as a list
(`Components/ArchiveEntryChoice.jsx`, rows after the ProjectsDrawer's model
rows). It is AlertDialog because that is the one dialog both seams reach:
the Open dialog closes on pick, and a drop never had a dialog. The click
resumes the seam, and closing the chooser leaves the open model where it is.
It lists the first 50 and counts the rest ("And 10 more"), since a bundle
can hold a model per part. A drop hands over to it through `onSuccess(null)`,
not `onError`: the onboarding overlay has to close for the chooser to show,
and its `onError` would open Help on top. The chooser names any `.ifc` with a same-named `.txt` beside it, the
sibling a Revit export writes (#1087). The `.txt` is not listed, and the
note says why.

**No model.** It stays an `unrecognizedFormat` alert, so it is one info
event tagged `upload.ext` from the archive's own name (`zip` for a `.zip`)
and never an entry name. It carries `archive: {exts}` — each tagged by
`unrecognizedFormat.js#extensionTag`, so a short alphanumeric or `other`,
because the text after an entry's last dot can be a name fragment — from which
`formatGuidance.js#archiveGuidance` says *"This archive has no model Share
can open (it contains .dwg and .pdf)"*. A native CAD file inside (`.rvt`,
`.dwg`, `.sldprt`, `.catpart`) adds that format's "export from it" line and
help link. An archive that can't be read at all (password-protected,
Deflate64/bzip2/LZMA, split `.z01`, damaged, past the ceiling, or past
what this browser could allocate) is the same alert with `archive:
{problem}`, and the dialog gives the reason.

So is a `.gltf` that names its buffers or textures by any URI that isn't
`data:` (matched as three's LoaderUtils does, `/^data:/i`). That covers the
Sketchfab download shape (`scene.gltf`, `scene.bin`, `textures/`): out of
the archive it is one file at `/share/v/local-only/<uuid>.gltf`, and
`scene.bin` would resolve to a URL the SPA answers with `index.html`. It
covers absolute `https://` URIs too, which is the simpler rule and the
safer one. It is refused with *"This glTF loads its data from other files
or links … Export the model as a single .glb, then open that"*. A `.gltf`
whose data is all `data:` URIs opens. A model entry of 0 bytes is skipped,
and so are empty files in the "it contains …" list. An archive of nothing
but empty files therefore reads as *"This archive is empty"*, not as an
archive "containing .ifc" with no model in it.

**Every failure while looking inside ends in a dialog.** The reader turns
everything an archive can cause into a `ZipArchiveError`, through
`zipArchive.js#asArchiveError`:

- A `RangeError` from a DataView or a typed-array length is a record whose
  numbers don't fit its bytes, so it is damage.
- An allocation failure (`utils/oom.js`'s patterns) is the device's limit.
  That includes `modelArchive.js` copying the entry into its `File`.
- A `NotReadableError` (a cloud placeholder not on the disk, a permission
  lost since the pick) is *"Share couldn't read this file"*.

Each mapping first logs the original error's name and message at WARN, so
a bug in our own reads leaves a Sentry breadcrumb instead of passing
silently as user damage. Anything else is a defect.
`openUploadThroughArchive` still ends it as an alert of the Error itself
(AlertDialog reports it to Sentry) and `refused`. So a failure *while
looking inside the archive* always ends in a dialog, and for a drop in
`onError`. An error from the seam's own open of the model file it is
handed (the OPFS write, the type sniff) is not caught here. It propagates
exactly as it did before archives existed.

**The ceiling, and what it trusts.** 512 MiB per entry, which is the gzip
envelope's figure and reason (glb-export-premium.md §4.7). 512 MiB is also
the total for one upload, across every entry it inflates. That total binds
only for a `.ifczip` inside a `.zip`, which inflates twice while both
copies are held. Neither check trusts the archive. The declared size is
used to *refuse* early: past the ceiling, nothing is read. Under the
ceiling, the declared size becomes the output buffer, and the inflate is
**counted as it runs**: the first chunk past the declared size is an
error, and so is finishing short of it. Input goes in 16 KiB at a time, so
a bomb whose header lies low stops at its lie plus one push (≤ ~16.5 MiB at
deflate's ~1032:1), never at its full expansion. The compressed size is
capped as well, since reading it is an allocation. Only the chosen entry's
bytes are ever read. The directory comes from the tail of the Blob, so a
2 GB download bundle around a 20 MB model reads about 20 MB. CRCs are not
checked: the size check catches a lying header, and corruption inside a
deflate stream almost always fails the inflate.

**`.ifczip`** is the one archive that *is* in `supportedTypes`. It is the
standard IFC transport, a zip of one `.ifc`, so it routes, lists in the
GitHub browser and parses out of a permalink. Before it was listed, the
unanchored suffix regex split `model.ifczip/12` into `model.ifc` plus an
element path `zip/12`. An uploaded one is unwrapped at the seams like any
zip. A hosted one shares `findLoader`'s IFC arm and is unwrapped in
`Loader#load` by `unwrapIfcZip`, one line after the gzip net, so conway
gets the `.ifc` and `loader.type` becomes `ifc` from there on (capabilities
and analytics see an IFC). The arms before that line correctly see a zip:
`canOpenFromStore` refuses it, and the truncated-part-21 check skips it. A
hosted `.ifczip` is excluded from the GLB cache (`wantGlb`), because that
path's source handle would be the zip, and `spillModelSource` would back
conway's later reads of the IFC with zip bytes. It opens uncached. An
uploaded one caches as the `.ifc` it was stored as. A hosted one that isn't
exactly one readable IFC throws a `ZipArchiveError`. CadView raises it as an
`archiveUnreadable` alert ("Can't open this archive", with the reason), which
is counted in analytics only and kept out of `captureException`, like an
unsupported schema. `load_failed` still fires for it, as it does for that
schema refusal: it is a failed open.

**Out of scope, and what happens.** A `.zip` from GitHub or Drive is not
routed (`zip` is not a type), so it never reaches these seams. That is the
follow-up, and `connections/loadFromSource.js` is untouched. `.rar` and
`.7z` have no small browser decoder. They get `ARCHIVE` guidance (*"Unpack
it first"*). A `.zip.gz` is not unwrapped: the gzip seam inflates only a
member whose inside sniffs as a model, and a zip doesn't. A multi-file
`.gltf` is refused (above) rather than opened from its side files: only the
chosen entry is ever extracted. The inflate is synchronous fflate on the main
thread. It yields every 4 MiB of input, but a very large entry still costs
the page a few busy seconds. `DecompressionStream('deflate-raw')` would move
that off the thread.

**Tests.** `zipArchive.test.js` covers the directory, zip64 (including a
sub-field that claims more than its record), both ceilings, a lying-low bomb
(counting what the inflate produced, not only the refusal), allocation
failure and the error mapping. `modelArchive.test.js` covers entry
selection, the pass-throughs, nesting under one total, the seam outcomes
and `unwrapIfcZip`, plus 0-byte entries, multi-file glTF, extension tags and
a defect ending in the dialog. `formatGuidance.test.js` covers the no-model
text. `AlertDialog.test.jsx` covers the chooser (its cap, repeated paths, a
choice that fails) and `archiveUnreadable`, which `CadView.test.jsx` raises. Each seam has its own suite
(`dragAndDrop.archive.test.js` and `loader.test.js`). `Loader.test.js`
covers a hosted `.ifczip` through `load()`, and that it never reaches the
GLB cache. `routes.test.ts` and
`Filetype.test.js` cover `ifczip` ahead of its `ifc` prefix. E2E:
`loader/modelArchive.spec.ts`, desktop and mobile, covers a drop and a pick
of one model, a drop and a pick of several, and a drop of none.


## 2. Wire the loader — `src/loader/Loader.js#findLoader`

Add a `case` returning the tuple
`[loader, isLoaderAsync, isFormatText, isIfc, fixupCb]`:

- **`isFormatText`** — true only if the loader's `parse()` wants a
  string. Several loaders take an `ArrayBuffer` and decode internally
  (USDLoader does), in which case keep it false even for a text format.
- **`fixupCb`** — only if the loader returns something other than a
  renderable `Object3D` (see `stl.js`, `pdb.js`, `glb.js`). A loader
  returning a `Group` needs none.
- **Colors the loader already decodes are the fixup's to render.**
  STLLoader parses binary STL's Materialise colors (a `COLOR=` header
  tag, then a 5-bit RGB in each facet's attribute word) into a linear
  `color` attribute plus `geometry.hasColors`/`alpha`; `stl.js` turns
  that into `vertexColors` over a white base and leaves uncolored
  files in the default blue-grey. A loader's linear colors need
  converting back to sRGB when `?feature=look` is off, or the legacy
  linear output shows them gamma-darkened; `makeSurfaceVertexColors`
  (lookMaterial.js) does that, as `makeSurfaceColor` does for IFC. The
  color-space reasoning and the
  cases it declines (all-black facets, zero alpha, the VisCAM bit
  layout STLLoader doesn't read) are in its header.
- Related extensions can share one arm when the loader sniffs the
  variant itself.
- `readModel` calls `loader.parse(modelData, basePath)`. A loader whose
  second `parse` argument means something else needs a small wrapper,
  e.g. `ADFLoader#parse(buffer, {meshes})`, which `loader/adf.js`
  wraps so the basePath string never reaches it.


## 3. Declare capabilities — `src/viewer/ShareModel.js`

Add the extension to `UNSTRUCTURED_MESH` (or `IFC_LIKE` if it carries
real spatial structure and typed properties), and to the
`ShareModelFormat` typedef. This decides which viewer features light
up; `inferModelCapabilities` can promote individual flags later by
inspecting geometry.


## 4. What you get for free

`convertToShareModel` runs on every non-IFC model and already provides:

- **NavTree labels** — node names on `Object3D.name` (which is where
  three.js loaders put glTF node names, OBJ group names, USD prim
  names) are mirrored into the IFC-shaped `Name`/`LongName` the NavTree
  and Properties panel read.
- **Raycast part IDs** — per-node `expressID` serials, which is what
  click/hover picking and placemark annotations resolve against.

So "semantic tree + pick a part" needs no format-specific code, as long
as the loader populates `Object3D.name`.


## 5. Tests — both layers

**Unit** (`src/loader/Loader.test.js`): a fixture under
`testdata/models/<fmt>/` and a `load()` case asserting more than "it
parsed" — assert the NavTree names and the picking IDs, since those are
the two things a format silently loses. Add the extension to that
file's `binaryExtensions` list if the fixture is binary, or the harness
will hand the loader UTF-8 mojibake.

**E2E** (`src/Components/Open/Filetypes.spec.ts`): a fixture under
`src/tests/fixtures/github/bldrs-ai/test-models/main/<fmt>/` plus a
screen test. Fixtures must live there — `yarn test-flows` runs
`yarn clean` before building, so anything hand-copied into
`docs/__test_fixtures__/` is deleted before the run. See
[PLAYBOOK.md](../../PLAYBOOK.md) §"Screenshot goldens" for generating
the golden.


## 6. Loading from GitHub: Git LFS

`bldrs-ai/test-models` LFS-tracks every model extension it carries, and
new formats generally get added there. GitHub serves an LFS-tracked
file as a ~130-byte *pointer* from both the Contents API and
`raw.githubusercontent.com`; only `media.githubusercontent.com`
resolves the object. `net/github/lfs.js` detects a pointer during the
Contents API dereference and redirects, and `Loader#load` throws a
named error if one reaches it anyway (a pasted
`raw.githubusercontent.com` URL skips the dereference entirely). No
per-format work is needed — but if a model loads as a few-hundred-byte
parse failure, this is the first thing to check.
