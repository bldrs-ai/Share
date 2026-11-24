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

*A zip is opened by what is inside it, from every source.* A drop, a pick, a
GitHub file, a Drive link and a pasted URL all reach the same policy
(`modelArchive.js`). The archive's own name never picks the model: a
`.zip`, a `.ifc.zip`, a `.ifczip` and a zip renamed to `x.ifc` all open the
one model inside, typed by that entry. The upload seams came first
(Share#2006). Downloads followed (§"A downloaded archive", below).

Half of the uploads the Open dialog rejected in the 2026-11-01 triage were
archives (bldrs-ai/ops#26), mostly named as if a format Share opens was
inside (`part.stp.zip`, `… ifc.zip`, download bundles). Share#2006 opens
the model inside, on the gzip envelope's pattern: nothing downstream of the
unwrap knows there was a zip. (`zip` is now in `supportedTypes`, but only so
that a hosted one routes. Its `findLoader` arm is a placeholder that a load
never parses with.) The difference is that a zip is a **container**: it can hold no model, one, or
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

**No model.** It stays an `unrecognizedFormat` alert, so it is one GA
`alert` event with `upload_ext` from the archive's own name (`zip` for a
`.zip`) and never an entry name. It carries `archive: {exts}` — each tagged by
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

**A downloaded archive.** Both `zip` and `ifczip` are in `supportedTypes`,
so they route, list in the GitHub browser and parse out of a permalink.
The browser lists every `.zip`: the name doesn't have to say what is
inside. A route is split at the file's *outermost* suffix
(`Filetype.js#splitAroundExtension`, at a segment boundary), so
`box.ifc.zip/12` is `box.ifc.zip` plus element `12`. A path with no type at
a boundary falls back to the first type anywhere, so `x.glb.gz` still routes
as before. The GitHub browser lists a name only by its final suffix, so
`foo.zipx` isn't listed as a zip it couldn't route. It is not `box.ifc`
plus `.zip/12`, which used to make the route ask GitHub for a `box.ifc`
that isn't there. A URL with no extension, such as a Drive link, is typed
by its header (`Filetype.js#guessType`). A plain zip there reads as `zip`,
while `analyzeHeader` itself still answers null for one, because
`modelArchive.js` relies on that null to tell an archive from a zip-based
model.

The unwrap is in `Loader#load`, one step after the gzip net:
`unwrapHostedArchive`, the same `resolveArchiveUpload` the seams use. It
runs for a `.zip` or `.ifczip` route. It also runs for any download under a
*binary* format's name whose bytes are a zip: a renamed `.ifczip` at
`x.ifc`, or a zip at `x.glb`. USDZ and SOG are excluded, since they are
zips themselves (`ZIP_MODEL_TYPES`), and so are GLB cache hits. A zip under
a text format's name (`x.obj`, `x.gltf`) is not sniffed: that load is read
as text before this point, as a `.gz` under one is. One model inside retypes the load: `findLoader` again for the
entry's type, or a retag of the IFC arm for a part-21 inner model. From
there, the parse, capabilities and analytics all see that model. A zip of
DICOM slices becomes its NRRD, so **a scan in a GitHub repo is a link
someone can share**, with its view terms (`#c:`, `#cp:`, `#d:`) like any
model. Bytes under a `.zip` name that aren't a zip are typed by their
header, as an upload is, and a `.ifczip` the sniff can't place still goes to
conway as the IFC it was named. A plain `.zip` *inside* an archive is never a
model (it's a bundle's attachments as often as not). A `.ifczip` inside one
is, and is unwrapped once. The load report's model line names the model
inside, not the zip.

The arms before the unwrap saw the route's name. For an archive route that
is correct: `canOpenFromStore` refuses it, the truncated-part-21 check
skips it, and `wantGlb` excludes it. The GLB cache's handles are the
source file, which here is the zip, and `spillModelSource` would back
conway's later reads of the model with zip bytes. A zip under a model's
*name* gets past `wantGlb`, so the unwrap drops the export context
(`glbExportContext = null`). Every downloaded archive therefore opens
uncached. An uploaded one caches as the entry it was stored as. Caching
the inner model of a download is a follow-up. The OPFS source health check
skips a zip too. A stored (uncompressed) entry would otherwise put a part-21
head above the zip's directory, which reads as a truncated file: evicted
and re-fetched on every load.

**When a downloaded archive can't open.** It throws a `ZipArchiveError` if
it holds several models (a link can't ask which one), holds none, or can't
be read. CadView raises that as an `archiveUnreadable` alert ("Can't open
this archive", with the reason). The alert is counted in analytics only and
kept out of `captureException`, like an unsupported schema. `load_failed`
still fires for it, as it does for that schema refusal, since it is a failed
open. The several-models refusal names the first five entries by their path
in the archive, "and N more" after that. The no-model refusal's list of what
the archive holds ("it contains .dwg and .pdf") goes to the dialog alone in
the same way. Its extensions are tags, but they are still the tails of the
user's entry names. Both ride `ZipArchiveError#dialogText`, which only the
dialog shows. The error's `message` is what `trackAlertEvent` counts, and it
names nothing of the archive's.

**Out of scope, and what happens.** A downloaded archive of several
models has no chooser (above). The chooser waits for demand: doing it in
general means pausing a load mid-flight on a dialog. `.rar` and
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
and `unwrapHostedArchive` (any name, DICOM, not-an-archive, the refusals and
what their message withholds), plus 0-byte entries, multi-file glTF, extension tags and
a defect ending in the dialog. `formatGuidance.test.js` covers the no-model
text. `AlertDialog.test.jsx` covers the chooser (its cap, repeated paths, a
choice that fails) and `archiveUnreadable`, which `CadView.test.jsx` raises. Each seam has its own suite
(`dragAndDrop.archive.test.js` and `loader.test.js`). `Loader.test.js`
covers a hosted `.ifczip`, `.zip`, `.ifc.zip`, a zip under a `.glb` name,
a DICOM zip, a non-zip `.zip` and the several-models refusal through
`load()`, and that a `.ifczip` never reaches the GLB cache. `routes.test.ts`
and `Filetype.test.js` cover `ifczip` ahead of its `ifc` prefix, the
outermost-suffix split, and `guessType`'s `zip`. `GitHubFileBrowser.test.jsx`
lists every `.zip`. E2E:
`loader/modelArchive.spec.ts`, desktop and mobile, covers a drop and a pick
of one model, a drop and a pick of several, and a drop of none.
`loader/hostedArchive.spec.ts`, desktop and mobile, opens GitHub-hosted
links: a `.ifc.zip`, a DICOM zip (also reopened with a camera on the hash),
a zip renamed `.ifc` (which opens uncached, while the plain IFC caches), and
a zip of several models refused with their names.


## A DICOM series becomes one NRRD

CT and MR scans leave the scanner as a folder of DICOM files, one per
slice, and reach users zipped. Share opens such a zip as a volume, in
three steps, each a module:

1. **Detect the slices** — `loader/modelArchive.js#dicomVolume`, at the
   archive seam. It runs only for an archive with **no model in it** (an
   `.ifc` beside the slices wins). Candidates are entries named `.dcm`,
   `.dicom`, `.dic`, `.ima`, with no extension (`IM0001`, the most common
   scanner export), or with an all-digit extension (files named by their
   SOP Instance UID, `1.2.840.113619.2.55.3`). Each is kept only if it has
   the Part 10 preamble and `DICM`. A DICOM file with no pixel data (a
   DICOMDIR, a report) is skipped. A slice that can't be read is skipped
   too, as long as some other slice can be.

   Candidates are guesses (any extensionless file), so looking at one
   mustn't change what an archive **without** DICOM is told. Each is
   inflated against a scratch budget of the whole 512 MiB ceiling, and
   charged to the upload's real budget only once it has proved to be DICOM,
   so a `LICENSE` costs nothing and can't fail for room the slices used.
   An entry that can't be extracted (encrypted, Deflate64, past the
   ceiling) is skipped while it might be anything. It is raised once the
   archive has proved to hold DICOM, since it may be a slice and a series
   must not open as if whole, and also when it is named `.dcm`. An archive
   with no DICOM falls through to "holds no model" exactly as before.
2. **Stack them into one NRRD** — `loader/dicom.js`. A small reader for
   the uncompressed transfer syntaxes (implicit and explicit VR little
   endian, which scanners and PACS exports write by default) and the two
   compressed ones it can decode with nothing new in the bundle: Deflated
   Explicit VR (`.1.99`, fflate, already vendored with three; the dataset
   inflates, counted, to at most 64 MiB a slice, so a deflate bomb stops
   there; the input is fed 16 KiB at a time, since fflate inflates all it's
   given before it calls back, and a deflated slice briefly holds its
   inflated chunks and their join, about twice its size) and RLE Lossless (`.5`, PackBits per PS3.5 Annex G, a few lines
   in `decodeRle`, which checks every segment could fill the image before
   allocating it, and refuses a run that reads past its segment). It reads each
   slice's geometry, pixel format and rescale, and skips everything else.
   Skipping covers undefined-length sequences and items nested in each
   other; a Pixel Data inside a sequence (an icon thumbnail) is stepped
   over, since only the dataset's own is the image; and an undefined-length
   `UN` is read as implicit VR, whatever the file's syntax (PS3.5 §6.2.2).
   The transfer syntax is judged where the meta group ends, so a deflated
   or big-endian file is refused as that, not as damage.

   Slices are grouped by Series Instance UID, image size, orientation, echo
   number and temporal position, and the **largest series** opens, because
   a study export carries a few-slice scout beside the scan. (Echoes and
   phases share a series and every position; mixed, ordering would pick
   one image per position by zip order.) They're ordered by
   `ImagePositionPatient` along the slice normal (row × column), not by
   `InstanceNumber`. Without positions, `InstanceNumber` orders them, and
   without either the series is refused.

   The slice axis is the **position step**, first slice to last divided
   evenly, not the normal scaled by the gap. On a CT taken with the gantry
   tilted, each slice is offset along the table too, and the volume is a
   sheared box, which NRRD and `nrrd.js#placement` both take. It is never
   `SliceThickness`, the thickness of the cut, which differs from the gap
   in overlapping reconstructions. A volume is a regular grid, so the gaps
   along the normal must agree to within 10%. A missing slice, or a series
   with variable spacing, is **refused** rather than stacked evenly with
   every slice after the hole a gap out of place.

   The output is an NRRD in real units: `short` for Hounsfield; `ushort`
   for an integral unsigned range past 32767, at half the memory of
   `float`; `float` when the rescale isn't integral or neither fits. It is
   in `left-posterior-superior`, with the scanner's `space directions` and
   `space origin`, and a `modality:=CT` key/value pair. The voxels are
   written straight into the file buffer, after a header padded to their
   alignment. The seam hands it on as a `File` named
   for the archive (`CT1.zip` → `CT1.nrrd`), typed `nrrd`, so OPFS holds
   `<uuid>.nrrd`, and recents and reloads see an NRRD. Unlike an entry's
   resolution, it carries no `bytes` beside the `File`, which would keep a
   second whole volume alive while the seam writes the file.
3. **Render it** — `nrrd` is an ordinary format: a `supportedTypes` entry
   (sniffed by its `NRRD000` version line), a `findLoader` arm with three's
   `NRRDLoader`, and an `UNSTRUCTURED_MESH` capability set, so a `.nrrd`
   file opens on its own the same way. The
   fixup, `loader/nrrd.js`, windows the voxels to 8 bits (a normalized
   8-bit 3D texture filters linearly on every WebGL2 device, while 16-bit
   needs `EXT_texture_norm16`). A CT gets a fixed Hounsfield window with
   opacity ramping from 150 to 900 HU (bone, with tissue faint). Any other
   volume ramps from its histogram's Otsu threshold to its 99th
   percentile. The voxels go into a `Data3DTexture`, resampled past 512 on
   any edge, which a box ray-marches in its fragment shader. It composites
   front to back, lit by the gradient, and stops when nearly opaque. The
   box draws its back faces, so it still renders with the camera inside.
   It is placed where the scanner put the volume: millimetres to metres,
   and LPS to the scene's Y-up, superior up and anterior toward the
   default camera. That is a rotation, so the patient is never mirrored.

**A trap, commented where it bites.** The box's placement is **baked into
its vertices** and the inverse handed to the shader (`sceneToBox`), not
set on the Mesh's transform. `Loader#readModel` hoists the first child's
geometry onto a geometry-less root, and a unit cube there would add a 1 m
box at the origin to every bounds Share takes of the model, so
fit-to-frame would be wrong. (Before three r187, `NRRDLoader` also cut the
header one character short of its blank line. The header `dicom.js`
writes still ends in a comment line, which now carries the alignment
padding.)

**Memory.** The 512 MiB budget bounds what the archive inflates, not the
peak. The slices are held until stacked; the NRRD is about their size
again (twice for `float`), and its `File` copy is written to OPFS. The
load then reads it back, NRRDLoader copies it twice more, and the 8-bit
texture follows. A 500-slice 512 × 512 CT (≈ 270 MB of pixels) opens on a
desktop; on a phone, a series that size is near the device's limit.

**Refused, with the reason in the archive dialog** (as a
`ZipArchiveError`, so an `unrecognizedFormat` alert with
`archive.problem`, the same path as any unreadable archive):

- the compressed transfer syntaxes it has no codec for (JPEG baseline and
  lossless, JPEG-LS, JPEG 2000): each needs a decoder Share doesn't ship,
  to be added when a series in one is asked for; and big-endian explicit
  VR;
- color (`SamplesPerPixel` ≠ 1), multi-frame files, and bit depths other
  than 8 and 16;
- slices that differ in size, are unevenly spaced (a slice missing), or
  have nothing to order them by; damaged or truncated files.

**Out of scope, and what happens.** A DICOM zip on GitHub or Drive is not
routed, like any `.zip` (§"An archive is not a format either"). A lone
`.dcm` is not a format (`dcm` isn't in `supportedTypes`), so it's refused
as an unknown type; zip it. ACR-NEMA files without the Part 10 preamble
aren't recognized. `BitsStored`/`HighBit` masking and `MONOCHROME1`
(inverted grayscale) aren't applied, and float Pixel Data (7FE0,0008)
reads as no image. A `.nrrd` from elsewhere with a detached header
(`data file:`) or more than three dimensions isn't read correctly by
NRRDLoader. A series past the
512 MiB inflate budget (about 1000 slices of 512 × 512 × 16-bit) is
refused as too large. Several series in one zip don't put up the
chooser: the largest opens. The window and opacity are set in the Display menu's Volume section (§"The
volume in the Display menu", below); there is no full transfer-function
editor. The display
controls' wireframe mode just draws the box's edges.

**No selection, no Properties.** A volume has no elements and no
properties. The mesh's `raycast` is a no-op, so a click on it selects
nothing and doesn't outline the box. CadView turns the Properties panel
off when the loaded model is a volume (`nrrd.js#isVolumeModel`), and back
on for the next model. One consequence: the Q shortcut (a cut plane at the
cursor) raycasts the model, so it finds nothing on a volume. Use the
cut-plane menu.

**Cut planes cut the ray, not the box.** `MeshClipper` binds its
world-space planes to every model material's `clippingPlanes`. three's own
clipping would only discard the box's back faces, which isn't a cut
through the volume. So the shader leaves three's clipping chunks out, and
the mesh's `onBeforeRender` (`nrrd.js#syncClipPlanes`) moves up to six
planes into box space, through the mesh's world matrix and the baked
placement. The fragment shader then trims each ray's interval to the part
every plane keeps (`distanceToPoint >= 0`, as three keeps). A cut opens
the volume, and the cut face shows the tissue and bone inside it. A
plane's drag mutates it in place and asks for a paint, and the hook runs
before every draw, so dragging needs nothing more.

**The volume in the Display menu.** A volume's window and opacity are an
axis of the display-override stack, `volume` (`viewer/display/volumeMode.js`),
like color and residency: the Display menu sets it, `DisplayController`
applies it, and `#d:` carries it (`vw=<low>_<high>`, `vo=<percent>`; only
non-default). The window is in the volume's own units (HU for a CT), not the
texture's normalized range. A link then means the same thing whatever window
the voxels were packed with, and a CT's numbers are the ones a radiologist
would name. `nrrd.js` records the packing range, default ramp and unit on the
mesh (`userData.volume`), which `volumeMode.js` converts through to the
shader's `ramp` and `opacity` uniforms. The window slider keeps its thumbs a
step apart, since equal ends aren't a window. For a volume the menu shows only
this section: Shading would only draw the box's edges, and Color and
Residency have nothing to act on.

**Tests.** `dicom.test.js` reads pydicom-written series in both transfer
syntaxes (`testdata/models/dicom/`, generated by
`tools/models/makeDicomPhantom.py`). pydicom writes its sequences with
defined lengths, so the walk's undefined-length paths are covered by
files built in the test: nested undefined-length sequences and an icon's
Pixel Data, each in both VRs, and an undefined-length `UN`. It also covers
each refusal (big-endian and JPEG Lossless by name, a missing slice,
nothing to order by), pydicom-written RLE and deflated series stacking to
the uncompressed volume byte for byte, a damaged RLE frame, a deflated
dataset that doesn't inflate, a deflate bomb stopped at its cap, ordering by position over instance number, a gantry tilt, a
sagittal series, echoes split into stacks, the `short`/`ushort`/`float`
choice, and voxel values checked through three's own `NRRDLoader`.
`nrrd.test.js` covers placement in the scene, axis orientation (the
phantom's off-centre sphere lands on the viewer's right), a tilted
series placed voxel for voxel, windowing and resampling, the cut planes'
box-space transform under a moved model, and that the volume can't be
picked. `modelArchive.test.js` covers detection at the seam (UID-named and
`.DCM` entries, a model beside the slices winning, an unreadable series
ending in the dialog), that an unextractable non-DICOM entry leaves the
"holds no model" alert alone, that one in a DICOM archive refuses it, and
that only DICOM is charged to the budget. `Loader.test.js` covers a
`.nrrd` through `load()`, including that a ray through the volume picks
nothing while bounds still see it.

E2E: `loader/dicom.spec.ts`, desktop and mobile, drops and picks the
phantom zip and checks the volume changes a real WebGL2 frame. It checks
that a click on the volume selects nothing and Properties stays off. It
checks that a plan cut changes the frame (with the plane's arrow hidden)
and leaves part of the volume drawn. Last, it checks which side the cut
keeps: moved past the box with all of it on the kept side, the frame
equals the uncut one; with none of it, the volume-hidden one. Each of the
new walk, tilt and budget tests, and the E2E side check, was seen to fail
with its fix reverted.


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
screen test. Fixtures must live there — `bun run test-flows` runs
`bun run clean` before building, so anything hand-copied into
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
