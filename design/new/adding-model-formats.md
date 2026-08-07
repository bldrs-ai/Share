# Adding a model format

What it takes to teach Share a new file format, in the order the code
runs. Derived from the USD/USDA/USDC/USDZ addition
([#1728](https://github.com/bldrs-ai/Share/issues/1728) /
[#1729](https://github.com/bldrs-ai/Share/pull/1729)); the FBX, OBJ,
STL, PDB and XYZ formats sit on the same seams.

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

Be conservative. A sniff that is too broad silently swallows unrelated
uploads: gating `usdz` on a bare `PK` zip signature would have
classified every `.docx` and `.zip` as a model, turning a clean
"unknown type" alert into a parse failure deep inside the loader. The
USDZ check therefore also requires the archive's first entry to be a
`.usd*` layer — the rule the USDZ spec mandates and the loader
enforces.


## 2. Wire the loader — `src/loader/Loader.js#findLoader`

Add a `case` returning the tuple
`[loader, isLoaderAsync, isFormatText, isIfc, fixupCb]`:

- **`isFormatText`** — true only if the loader's `parse()` wants a
  string. Several loaders take an `ArrayBuffer` and decode internally
  (USDLoader does), in which case keep it false even for a text format.
- **`fixupCb`** — only if the loader returns something other than a
  renderable `Object3D` (see `stl.js`, `pdb.js`, `glb.js`). A loader
  returning a `Group` needs none.
- Related extensions can share one arm when the loader sniffs the
  variant itself.


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
