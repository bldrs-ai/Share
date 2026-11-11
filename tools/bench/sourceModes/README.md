# Source-mode bench

Measures how the engine worker's **source modes** compare, per model: the
windowed open over an OPFS sync access handle, the windowed open over a Blob
store that holds the whole file, the buffered open, the buffered-over-held-bytes
prototype (Share#2139), and the windowed open without the source hash. It
drives a built Share in headless Chromium, one fresh browser profile per cold
load, and writes one JSON record per load. It was built to settle the source
policy (buffered or windowed, by size, store and memory); the first results are
in [design/new/source-policy-measurements.md](../../../design/new/source-policy-measurements.md).

It is a hand-run tool, outside every build and every test runner: Jest's roots
are `src`, `__mocks__` and `netlify`, Playwright's `testDir` is `src`, and
nothing imports it. `bun run lint` lints it (`.eslintrc.cjs` turns off
`no-magic-numbers` for `tools/bench/**`).

| File | What it is |
|---|---|
| `run.mjs` | the driver: serves the build, runs rounds, writes records |
| `arms.mjs` | the arm table: flags, label, what each arm is expected to do |
| `pageProbe.mjs` | in-page code: index/tree times, preview meshes, long tasks, model signature, OPFS artifact removal |
| `lib.mjs` | pure helpers: report parsing, the arm check, grouping, the metric list |
| `summarize.mjs` | records → Markdown tables (median, range, n) |

It reuses the browser measurement library's Playwright-free halves
(design/new/browser-load-measurement.md): `loadProbe.ts#probeSource` for first
mesh, stage transitions and ready; `loadReport.ts#parseReportLines` for the
Total line; `loadRun.ts#summarize` for median/range; `loadProbe.ts#withFeatures`
for the URL. They are bundled at startup with the repo's esbuild.


## Running it

```bash
# 1. Build once. The playwright config is the production bundle (minified,
#    same esbuild settings) plus window.store, which the probe reads, and OPFS
#    on. Then restore package.json (tools/updateVersion.mjs stamps it, #1747).
SKIP_MARKETING=true bun run test-flows-build && git checkout -- package.json

# 2. Run. Each --model is label=path; label names the record and the URL.
node tools/bench/sourceModes/run.mjs --lock /tmp/bldrs-bench.lock \
  --model SEESTRASSE=/path/SEESTRASSE.ifc --model Arty_Z7=/path/Arty_Z7.stp

# 3. Tables.
node tools/bench/sourceModes/summarize.mjs tools/measure/sourceModes/records.jsonl
```

| Option | Default | Meaning |
|---|---|---|
| `--model label=path` | (required, repeatable) | a local IFC/STEP file; symlinked into the build as `/__bench_models__/<label><ext>` and opened as `/share/v/p/__bench_models__/<label><ext>` |
| `--arms a,b,…` | all six, in `arms.mjs` order | the arms of each round, in this order |
| `--reopen a,b,…` / `none` | `policyDefault,windowedHandle,heldBuffer` | arms whose trial continues into the two reopen phases |
| `--n N` / `--n label=N` | by size: 5 under 100 MB, 3 to 300 MB, 2 above | rounds per model |
| `--lock path` | none | run each round as a child under `flock path` |
| `--out file` | `tools/measure/sourceModes/records.jsonl` (gitignored) | JSONL, appended |
| `--port` | 9181 | the static server's port |
| `--build dir` | `docs` | the built site |
| `--chromium path` / `BLDRS_BENCH_CHROMIUM` | Playwright's, else `/opt/pw-browsers/chromium` | the browser |
| `--spill-timeout-ms` | 120000 | how long to wait for the source spill after Total |
| `--no-skip` | resume on | run every trial even when the output already holds it |

**Rounds, not blocks.** A round loads the model once per arm, in arm order, so
a run is ABCDEF ABCDEF …: drift (thermal, a neighbour's build) lands on every arm
alike instead of on whichever arm ran last. Each round is one child process;
with `--lock` it holds the lock for that round only, so other benchmarks on a
shared machine wait minutes, not hours.

**Resume.** A re-run of the same command picks up where a crashed or
interrupted one stopped: a (model, arm, round) trial is skipped when the
output already has an ok, uncontended record for each phase it runs, or has
already been tried three times (`lib.mjs#trialDone`; the model is matched by
label and size). A torn last line from a killed append is ended before the
first new record goes on. `--no-skip` turns this off.

**Quiet machine.** Before each trial the round waits, up to 5 min, until other
processes keep under 0.5 cores busy over 2 s (`waitForQuiet`). The lock keeps
other benchmarks out; this keeps out what does not take the lock, such as a
build. Each record says how long it waited and how busy the rest of the machine
was during the load (`machine.foreignBusyCores`).

**An interrupted run cleans up nothing.** Cleanup runs in `finally` blocks and
on normal exit, so SIGINT or SIGKILL (a Ctrl-C, a timeout, an OOM kill) skips
it and can leave behind:

- the `http-server` child on the `--port` (a later run then fails to bind, or
  talks to the old server): `pkill -f 'http-server.*-p <port>'`;
- a Chromium profile under the OS temp dir (`bldrs-bench-profile-*`, plus a
  `bldrs-bench-round-*` spec directory): `rm -rf "${TMPDIR:-/tmp}"/bldrs-bench-profile-* "${TMPDIR:-/tmp}"/bldrs-bench-round-*`;
- the model symlinks under `<build>/__bench_models__/`, which are links to
  your files, so removing the directory does not touch the models:
  `rm -rf <build>/__bench_models__` (the next run recreates them).

Separately, `lib.mjs` bundles the shared Share modules into a
`bldrs-bench-lib-*` directory under the OS temp dir on every run and never
removes it, on a clean exit too. It is small; clear them with
`rm -rf "${TMPDIR:-/tmp}"/bldrs-bench-lib-*` when you like.


## What a trial does

1. A fresh profile (`launchPersistentContext` on a new temp dir), the
   returning-user cookie, the two probes as init scripts, a CDP auto-attach to
   the page's workers.
2. **cold**: navigate; poll until `isModelReady` and the report's Total line.
   Read worker memory (no GC) and the renderer's RSS at Total, pause the viewer's
   painting (`setRenderUpdate`, as utils.ts#pauseViewerRendering), read worker
   memory with a GC at Total+3 s, wait for the source spill (the
   `[glb] source spill` line, or `writer: wrote` + 1 s on a path that logs its
   spill only at verbose level), read again with a GC 2 s after it, then sign
   the model: the tree's node count and hash, and one property read of the
   middle leaf, hashed and timed.
3. For a reopen arm, in the same profile:
   - **reopenArtifact**: reload. The GLB artifact the cold load wrote answers
     it; no engine runs.
   - **reopenSidecar**: remove every `.glb` from OPFS (as
     `engineSidecar.spec.ts` does), reload. The engine opens from the index
     sidecar the cold load saved. Its signature is compared with the cold
     load's (`reopenCheck`).


## Arms

| Arm | `?feature=` | Expected |
|---|---|---|
| `policyDefault` | (none) | the source policy's default: buffered (the sync access handle read whole, under the cap), `Engine source: buffered`, sidecar saved |
| `windowedHandle` | `disableBufferedSource` | windowed, OPFS sync access handle, sidecar saved: Chromium's default before the policy |
| `windowedHeld` | `disableEngineSyncHandle,disableBufferedSource` | windowed, Blob store holding the whole file, sidecar saved: Firefox's and Safari's default before the policy |
| `buffered` | `disableStreamOpen` | buffered, no store, no sidecar |
| `heldBuffer` | `disableEngineSyncHandle` | buffered over the Blob store's held bytes, sidecar saved: the policy on Firefox and Safari (was the `engineHeldBufferOpen` prototype) |
| `noSidecar` | `disableEngineSidecar,disableBufferedSource` | windowed, sync handle, no source hash, no sidecar |

Records made before the policy carry the arms' old flags in `features`
(`windowedHandle` had none; `heldBuffer` had `engineHeldBufferOpen`); the
paths the names stand for are the same.

**What the arm check means.** `checkArm` compares what the arm is named for
with what the load did: the open kind from the engine worker's pump line
(`windowed=yes|no`), the store from the `Engine source I/O:` line, the sidecar
from the `Engine index:` line, and the policy's mode from the `Engine source:`
line (`expect.sourceMode`). A mismatch is recorded in `armCheck.problems`
and printed, not thrown: a flag that stopped applying, or a format a path
doesn't cover, is a finding. `summarize.mjs` prints every problem under its
table.

**To add an arm:** add an entry to `ARMS` in `arms.mjs` with its flags and its
`expect` (`open`, `store`, `sidecar`), and name it in `--arms`. Several flags
combine as one comma-separated `?feature=` (src/FeatureFlags.js). If the arm
changes the report's lines, teach `lib.mjs#parseLoadReport` the new shape; its
parse is tolerant, so a new line is ignored rather than fatal.

**To add a model:** pass `--model label=path`. Nothing else: the format is
taken from the extension, the URL from the label. A model on another host,
fetch it first; the bench serves only local files, so the download is the same
local copy for every arm.


## Record schema (`bldrs.sourceModeBench/1`)

One JSON object per line. Times on the page clock are ms from the final
document's navigation start; "since open" is from the end of the
`Preparing file download` stage, which is also where Share#2092's engine time
starts.

| Field | Meaning |
|---|---|
| `model` | `{label, bytes, mb, format}` |
| `arm`, `features`, `phase` | the arm name, its flags, `cold` / `reopenArtifact` / `reopenSidecar` |
| `round`, `rounds` | position in the run |
| `ok`, `error` | whether the load reached ready and Total; a failed record keeps what it got |
| `env` | `chromium`, `shareCommit`, `shareDirty`, `conwayInstalled`, `build {dir, builtAt}`, `cpus`, `totalMemGb`, `loadavgAtStart` |
| `machine` | `foreignBusyCores` and `ownBusyCores` over the phase, `loadavg1AtEnd` |
| `quietBeforeTrial` | `{waitedMs, foreignBusyCoresBefore}` |
| `report.lines` | the load report, verbatim |
| `report.stages` | `{label: seconds}` for every finished stage line |
| `report.totalSeconds`, `report.engineSeconds` | Total, and Total minus `Preparing file download` |
| `report.engineWasmMb`, `report.windowMb` | from the Total line and the Geometry line's `window=` |
| `report.sourceIoLine`, `report.storeKind` | the `Engine source I/O:` line verbatim, and `syncHandle` / `blobHeld` / `blob` / null |
| `report.sourceModeLine`, `report.sourceMode` | the `Engine source:` line verbatim, and `buffered` / `windowed` from it |
| `report.indexLine`, `report.sidecarSaved`, `report.fromSidecar` | the `Engine index:` line verbatim, and what it says |
| `report.pumpLine`, `report.openKind` | the engine pump's console line, and `windowed` / `buffered` from it |
| `armCheck` | `{ok, problems[]}` |
| `timings` | `openStartMs`, `firstMeshMs`, `indexAtMs`, `treeAtMs`, `modelReadyMs`; `firstMeshSinceOpenMs`, `firstPreviewSinceOpenMs`, `indexSinceOpenMs`, `treeSinceOpenMs`, `readySinceOpenMs`; `previewMeshesAtIndex`, `previewMeshesAtTree`, `previewMeshesMax`; `stageTransitions` |
| `longTasks` | main-thread long tasks that started before ready: `{count, totalMs, maxMs}` (page boot included, the same in every arm) |
| `memory.worker` | the Engine worker over CDP: `peakUsedMb` / `peakBackingMb` (max of 500 ms polls, no GC), `atIndex`, `atTotal` (no GC), `total3s`, `afterSpill` (GC'd); each `{usedMb, backingMb, gc}` |
| `memory.renderer` | the page's renderer process from /proc: `hwmMb` (peak RSS over the phase), `rssMb`, `pssMb` at the end, `atTotal` |
| `spill`, `writer` | the spill and writer console lines and their ms after Total |
| `signature` | `treeNodes`, `treeHash`, `leafId`, `propsHash`, `propsReadMs`, `propsError` |
| `reopenCheck` | reopenSidecar only: `treeMatches`, `propsMatch`, both signatures |

**What the numbers are, exactly.**
- `firstMeshMs` is loadProbe's: the first frame whose scene holds a mesh the
  viewer didn't build at init, preview or durable. Scene presence, to about a
  frame.
- `previewMeshes*` are meshes in the load-preview group, the visible count.
  They are not conway's preview units; one unit can emit several meshes.
- Worker `backingMb` is `Runtime.getHeapUsage().backingStorageSize`:
  ArrayBuffer backing stores, so the held file and window copies. It does
  NOT include the wasm memory: after the spill it reads below the Total
  line's `engineWasmMb` on every model measured (SEESTRASSE 26 MiB against
  69), so read `engineWasmMb` beside it. `usedMb` is the JS heap. The 500 ms polls are not GC'd, so the peak
  is an upper bound of live memory and can miss a spike between polls.
- Renderer RSS covers the page and every worker (they are threads of it),
  SwiftShader's buffers included.


## Confounders

- **Software GL.** Headless Chromium renders with SwiftShader, on the CPU.
  The viewer paints on demand during a load (since #2043), and the bench
  doesn't freeze the loop, so a load pays for the paints a user's load would
  ask for, at CPU prices. Compare arms within one run; don't compare the
  absolute numbers with a GPU browser.
- **A shared machine.** Read `machine.foreignBusyCores`. A record with other
  processes using a core or more during its load measures the neighbour too.
- **The download is local.** Every arm reads the same file from the same
  local server; engine time excludes it.
- **Cold means cold for this origin**, not for the OS: the model file is in the
  page cache after the first load of it.
