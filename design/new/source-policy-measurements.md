# Source-policy measurements: buffered vs windowed, by size, format and store

Measurements for the engine's **source policy** (Share#2139, Share#2092): when
an open should read the whole file into the engine worker (buffered) and when it
should page it through a window (windowed). This doc is numbers and what they
do and don't show; the policy itself is written elsewhere. The harness is
[tools/bench/sourceModes/](../../tools/bench/sourceModes/README.md), and its
README is the record schema and the confounder list.

**Status (2026-11-11):** done. Three runs, all headless Chromium:
the first matrix (13 models, 2.3 to 860.7 MiB, IFC and STEP, 471 records,
conway `1.1643.778`); the re-measure on conway `1.1645.781`
([After conway 1.1645.781](#after-conway-11645781-2026-11-11), 7 models,
150 records), which found the buffered arms' after-spill retention
unchanged and traced it to Share; and the measure of the source policy as
built, with that retainer fixed
([Source policy as built](#source-policy-as-built-2026-11-11), 7 models,
147 records). The policy itself is engine-worker.md §5.6. The summary
of the first matrix is next; each size class has its own section after
the two later runs, and the full tables are at the end.

## Setup

- **Build:** the playwright config of the production bundle
  (`SKIP_MARKETING=true yarn test-flows-build`) at Share `7924244`, which is
  the product code of every record; records stamped `2630c91` differ only in
  `tools/bench/`. Conway `1.1643.778-g5233308a`.
- **Browser:** headless Chromium 153.0.8010.12 (Playwright's), SwiftShader
  (software GL), 1280×800. 4 vCPU, 17 GB container, shared with other agents'
  test suites under one bench lock (`flock`, per round).
- **Cold** = a fresh browser profile per load: no OPFS copy, no GLB artifact,
  no sidecar. The model file is still in the OS page cache after its first load.
- **Reopen** (arms `windowedHandle` and `heldBuffer` only), in the cold load's
  profile: **artifact hit** = reload, the GLB artifact answers, no engine;
  **sidecar reopen** = every `.glb` removed from OPFS, reload, the engine opens
  from the index sidecar the cold load saved.
- **Interleaved:** each round runs the five arms in order (ABCDE ABCDE …).
- **Contention guard:** a trial whose phases saw other processes average
  > 0.75 busy cores is retried (up to 2 more times) and left out of the
  statistics (`+Nc` in the n column). The conway agents' `tsc --build` runs
  outside the lock, so this fired often.

| Arm | `?feature=` | What the report showed it did (checked per record) |
|---|---|---|
| `windowedHandle` | none | windowed (`windowed=yes`), `OPFS sync access handle`, sidecar saved |
| `windowedHeld` | `disableEngineSyncHandle` | windowed, `Blob store (disabled; whole file held, …)`, sidecar saved |
| `buffered` | `disableStreamOpen` | buffered (`windowed=no`), no source I/O line, no sidecar |
| `heldBuffer` | `disableEngineSyncHandle,engineHeldBufferOpen` | buffered, no source I/O line, sidecar saved |
| `noSidecar` | `disableEngineSidecar` | windowed, sync handle, no `Engine index:` line |

Every record so far passed its arm check, IFC and STEP alike (the engine
pump's `windowed=` flag and the source I/O and index lines matched the arm).

**Columns.** Times in seconds. *Engine* = Total minus `Preparing file
download` (Share#2092's engine time). *1st mesh*, *Index*, *Ready* are from
open start (end of the download stage) on the page clock: first mesh in the
scene, `indexedModel` set in the store, model ready. *Prev@idx* = meshes in
the load-preview group when the index landed (scene meshes, not conway's
preview units; the units are not exposed to the page). *LT n / LT s* =
main-thread long tasks that started before ready, count and total (page boot
included, the same in every arm). *W peak* = engine worker ArrayBuffer
backing store, max of 500 ms un-GC'd polls (MiB); *W idx* = the poll at the
index; *W spill* = backing store with a GC 2 s after the GLB writer's source
spill; *W heap spill* = JS heap then; *wasm* = `engineWasmMb` from the Total
line; *R peak* = renderer process peak RSS (page and workers, SwiftShader
included). Cells are `median (min–max)`.


## What the numbers show

All on headless Chromium; 13 models, 2.3 to 860.7 MiB. Medians; the
per-model sections and tables below give ranges and n.

**Cold engine time, buffered and `heldBuffer` against `windowedHandle`
(Chromium's default):**

| Model | Format | MiB | n | windowedHandle | buffered | heldBuffer | windowedHeld | noSidecar |
|---|---|---|---|---|---|---|---|---|
| duplex | IFC | 2.3 | 5 | 0.91 s | −20 % | −12 % | +1 % | −8 % |
| Right_Hand | STEP | 3.6 | 5 | 1.93 s | −3 % (noise) | −2 % (noise) | +2 % | −7 % |
| gearbox | STEP | 6.2 | 5 | 1.55 s | −12 % (overlaps) | −8 % (overlaps) | −8 % | −9 % |
| SEESTRASSE | IFC | 13.6 | 5–6 | 1.89 s | −13 % | −5 % (overlaps) | +3 % | +5 % |
| FM_ARC_DigitalHub | IFC | 13.7 | 4–5 | 3.93 s | −17 % | −16 % | +1 % | −3 % |
| MB-Khaya | IFC | 31.4 | 5 | 5.94 s | −43 % | −41 % | 0 % | −1 % |
| Arty_Z7 | STEP | 55.5 | 3 | 14.12 s | −3 % (touching) | −3 % | −1 % | +1 % |
| DSA2 | STEP | 105.7 | 3 | 8.26 s | −18 % | −11 % | −2 % | −4 % |
| D3D | IFC | 213.6 | 3 | 55.27 s | −21 % | −21 % | −1 % | 0 % |
| sp-231MB | IFC | 231.4 | 3 | 20.38 s | −24 % | −18 % | +3 % | 0 % |
| BLSN_007 | STEP | 268.6 | 2 | 23.33 s | −10 % | −5 % | +2 % | −2 % |
| DOWA | IFC | 398.4 | 2 | 27.08 s | −22 % | −10 % | −5 % | −9 % |
| PSB | IFC | 860.7 | 2 | 36.45 s | −17 % | −11 % | +3 % | −9 % |

- **Size below which windowed is not measurably different from buffered:**
  - **IFC: none in this set.** Buffered was faster on every IFC, with
    disjoint ranges, from 2.3 MiB (−0.18 s) up. The absolute gap is small
    below ~15 MiB (0.2–0.7 s) and grows from there (−2.6 s at 31 MiB,
    −5 to −12 s at 214–231 MiB, −6 s at 861 MiB).
  - **STEP: up to ~56 MiB.** At 3.6, 6.2 and 55.5 MiB the arms are within
    noise of each other (≤ 0.5 s); at 105.7 MiB buffered is 18 % faster and
    at 268.6 MiB 10 %. Two models bracket the change; it is not located
    more finely than 56–106 MiB.
  - The gap is in Parse and Geometry on both formats (the windowed pump
    pages each unit's closure through the window).
- **Time to first pixels:** buffered draws its first mesh first, or ties,
  on every model: 0.5–1.0 s after open up to 31 MiB, 1.0–2.5 s on the
  medium models, 2.6 s PSB (against 3.5 windowed). The two arms that hold
  the file and hash it (`windowedHeld`, `heldBuffer`) start ~0.4–1.6 s
  later than buffered on the IFCs ≥ 214 MiB.
- **Previews before the index:** buffered shows 2–4× the preview meshes of
  windowed when the index lands on the large IFCs (PSB 2,173 against 669;
  D3D 4,681 against 1,117; sp-231MB 2,185 against 1,879) and lands the
  index sooner. STEP shows no preview meshes before its index on any arm.
  Small models reach the index in 0.5–1.5 s, before previews matter.
- **Worker memory (ArrayBuffer backing store; wasm excluded, reported
  separately as `engineWasmMb`, which no arm changes):**
  - Peak (un-GC'd, upper bound): windowed arms peak higher than buffered
    on the medium IFCs (sp-231MB 926 MiB against 377); `windowedHeld` is
    the highest arm on every model ≥ 100 MiB (PSB 2,326 MiB).
  - **After the spill, the buffered arms retain source memory on six
    models**, though they log `released resident source buffer`: PSB
    +796 MiB (1,096 against 300 windowed), BLSN_007 +208, sp-231MB +168,
    DOWA +143, D3D +16; nothing measurable on any model ≤ 106 MiB. A conway
    retainer was present at this point (Share#2139 step 1), and the later
    section finds a second, Share-side retainer pinning the same buffer, so
    this excess cannot be attributed to conway alone. It is **not
    IFC-only** (BLSN_007 is STEP). These
    after-spill numbers for `buffered` and `heldBuffer` should be re-read
    once the fix is pinned. *(Re-read: with the fix pinned the excess is
    unchanged on every model, and the remaining retainer is in Share's
    engine handler, not conway; see
    [After conway 1.1645.781](#after-conway-11645781-2026-11-11).)*
  - Renderer peak RSS is higher for the buffered arms on PSB (6.4 GB
    against 4.6 GB windowed), mixed elsewhere.
- **Reopen paths:**
  - **Artifact hit:** 0.07–0.26 s up to 31 MiB, 0.2–0.7 s on the medium
    STEP, 0.4 s on BLSN_007, 2.0–3.2 s on the IFCs ≥ 214 MiB; no engine, independent of arm.
  - **Sidecar reopen:** always cuts Parse (by 70–90 %) and lands the
    index sooner, but its Geometry pages windowed, so against a **cold
    buffered** load it is slower on MB-Khaya (+49 %), D3D (+20 %),
    sp-231MB (+12 %), DOWA (+12 % `windowedHandle`, −2 % `heldBuffer`),
    about equal on Arty_Z7, and faster on DSA2
    (−12 %), BLSN_007 (−5 %) and PSB (−22 %).
  - A sidecar reopen draws **no previews before its index**; on D3D and
    sp-231MB its first mesh comes later than a cold load's (5.9 s against
    1.3 s; 2.2 s against 1.2 s).
  - **`heldBuffer` (arm 4) sidecar reopen verdict: works.** All 50
    `heldBuffer` sidecar reopens across the 13 models opened from the index
    (`Engine index: from sidecar (…), no parse`), windowed over the held
    Blob store, and matched their cold load's tree (node count + hash) and
    one property read. No record failed. (DSA2's tree is one node, so its
    check rests on the property read.)
- **What is inside the noise:** `windowedHeld` against `windowedHandle`
  on every model (−5 % to +3 %, overlapping); `noSidecar` against
  `windowedHandle` below ~400 MiB (the source hash costs ~3 s only on DOWA
  and PSB, −9 % each); STEP buffered against windowed at ≤ 56 MiB;
  `heldBuffer` against buffered on D3D. Typical within-arm spread was
  ±3–5 % at n = 5; n = 2 on the large models gives a range, not a spread.

**What these numbers don't show:**
- **Firefox and Safari.** `windowedHeld` is the Firefox/Safari *path*
  forced in Chromium; it does not carry Firefox's GC and JIT-tier costs
  (Share#2139: 78.5 s windowed against 58.5 s buffered on PSB in Firefox).
- **Software GL.** SwiftShader paints on the CPU; absolute times are not a
  GPU browser's. Compare arms within this doc only.
- **Cold storage.** The model file sits in the OS page cache after its
  first load; OPFS reads here are memory-speed.
- **Memory peaks** are 500 ms un-GC'd polls: an upper bound that can
  still miss a spike. The renderer peak in reopen phases is the same
  process as the cold load's, so it is not independent.
- **Preview units.** The counts are scene meshes in the preview group;
  conway's preview units are not exposed to the page.
- **The ~20 s reading** is the after-spill reading (GC'd, 2 s after the
  spill line, 5–17 s after Total on these models, up to 37 s on DOWA); no
  separate fixed Total+20 s sample was taken.


## Source policy as built (2026-11-11)

The source policy (`src/engine/sourcePolicy.js`, engine-worker.md §5.6)
with the after-spill retainer fixed (Share's `engineHandler.js#openModel`
closure, [above](#why-the-buffered-arms-still-retain-the-source)). Three
arms, each with its cold load; the first two also with both reopens:

| Arm | `?feature=` | What it ran (checked per record) |
|---|---|---|
| `policyDefault` | none | `Engine source: buffered (…, cap 2048 MB)`: the whole file read once through the sync access handle, buffered open, sidecar saved |
| `windowedHandle` | `disableBufferedSource` | windowed over the sync access handle, sidecar saved: Chromium's default before the policy |
| `buffered` | `disableStreamOpen` | the classic buffered open, no store, no sidecar |

**Setup.** Share `4339f1e` / `a527657` (the second differs in docs only),
conway `1.1645.781-g15220b10`, the same machine, Chromium 153, build config,
harness and contention guard as the runs above; 15:05–16:59 UTC. Records:
`tools/measure/sourceModes/records-policy.jsonl` (git-ignored), log
`run-policy.log`. 147 records, none failed, every one passed its arm check,
none contended; every sidecar reopen (42 of 42) opened from the index and
matched its cold load's tree and property read. n: MB-Khaya 5; DSA2,
sp-231MB, D3D and PSB 3; BLSN_007 and DOWA 2.

**Confounders.**
- **This run is slower on every arm**, the forced ones included, than the
  two earlier ones (`windowedHandle` cold: PSB 43.9 s against 34.6; sp-231MB
  25.4 against 20.2; MB-Khaya 7.3 against 5.8). Nothing in the arms'
  paths changed, so read it as the host (the session restarted between
  runs); **compare arms within this run only**, and not its absolute times
  with the tables above.
- **The cap was 2 GiB here, not 1.** Headless Chromium 153 on this 17 GB
  container reports `navigator.deviceMemory` = 16, so 128 MiB × 16. Every
  model measured is under 1 GiB, so no arm or number depends on it; it is
  why the policy now also caps at 1 GiB whatever the device reports
  (`BUFFERED_SOURCE_MAX_BYTES`, added after this run).

### (a) After the spill: the buffered source is released

Worker ArrayBuffer backing store, GC'd 2 s after the spill (MiB, median):

| Model | Format | MiB | `policyDefault` | `buffered` | `windowedHandle` | Before the fix: buffered / windowed |
|---|---|---|---|---|---|---|
| MB-Khaya | IFC | 31.4 | 23 | 23 | 55 | 55 / 55 |
| DSA2 | STEP | 105.7 | 61 | 61 | 167 | 167 / 167 |
| sp-231MB | IFC | 231.4 | 73 | 73 | 137 | 305 / 137 |
| D3D | IFC | 213.6 | 92 | 92 | 290 | 306 / 290 |
| BLSN_007 | STEP | 268.6 | 86 | 86 | 147 | 355 / 147 |
| DOWA | IFC | 398.4 | 119 | 119 | 375 | 518 / 375 |
| PSB | IFC | 860.7 | 232 | 232 | 296 | 1,093 / 296 |

- The retention is gone, on IFC and on STEP (BLSN_007, the STEP the snapshot
  did not cover, fell 355 → 86 MiB). The buffered arms now read **below**
  the windowed one on every model: after a spill the buffered model pages
  through a fresh store whose window is still empty, while the windowed
  model keeps the window its load filled. ("Before" is the 1645 run.)
- Until the spill the buffered worker still holds the file, by design: PSB
  at Total + 3 s (GC'd) 1,093 MiB `policyDefault` and `buffered` against
  293 windowed. The spill comes after the GLB writer, 17–21 s after Total
  on PSB, 40–43 s on DOWA.

### (b) Peak memory, PSB and DOWA

| Model | Arm | Renderer peak RSS, per round (MiB) | Median | Worker backing-store peak, un-GC'd (MiB) |
|---|---|---|---|---|
| PSB | `policyDefault` | 6,399 / 5,317 / 5,318 | 5,318 | 1,389 |
| PSB | `windowedHandle` | 5,579 / 5,578 / 5,574 | 5,578 | 1,313 |
| PSB | `buffered` | 5,075 / 5,450 / 5,008 | 5,075 | 1,239 |
| DOWA | `policyDefault` | 3,764 / 3,964 | 3,864 | 919 |
| DOWA | `windowedHandle` | 3,799 / 3,778 | 3,789 | 1,089 |
| DOWA | `buffered` | 4,082 / 3,964 | 4,023 | 903 |

- **The PSB renderer peak is not ~1 GB above windowed in this run.** The
  policy's median is 260 MiB *below* windowed, plain buffered 500 below; one
  `policyDefault` round (the run's first PSB load) peaked at 6,399, 820 MiB
  above windowed. DOWA: +75 MiB at the median, within its ranges.
- **What changed is the windowed arm, not the buffered one.** The 1645 run
  read PSB 6,402 buffered against 4,580 windowed; this one 5,075–5,318
  against 5,578. The windowed arm's peak rose ~1 GB between runs (a single
  traced windowed load in the 1645 run had already peaked at 5,516); the
  buffered arms' fell 0.9–1.3 GB. The retention fix cannot explain either
  move: it frees the source only at the spill, after the writer's peak,
  and the buffered worker holds the source through that peak in both runs
  (Total + 3 s, above). So **the excess the 1645 run reported is not
  established as real**: on this host and run the peaks are bimodal, and
  three loads per arm don't separate the arms. What can be said: on the
  median of three, buffering PSB under the cap did not raise the renderer
  peak here, and its worst load was 0.8 GB above windowed.
- The worker's own peak is higher buffered on PSB (+76 MiB) and lower on
  DOWA (−170), as before.

### (c) Time: the new default against forced windowed and plain buffered

Cold, median; % against `windowedHandle`, and against `buffered`:

| Model | Format | MiB | Engine `policyDefault` | `windowedHandle` | `buffered` | vs windowed | vs buffered | 1st mesh (pol / win / buf, s) | Index (s) | Prev@idx |
|---|---|---|---|---|---|---|---|---|---|---|
| MB-Khaya | IFC | 31.4 | 4.92 | 7.27 | 4.59 | −32 % | +7 % | 1.43 / 1.56 / 1.28 | 1.64 / 1.77 / 1.50 | 0 / 0 / 0 |
| DSA2 | STEP | 105.7 | 8.79 | 10.64 | 8.22 | −17 % | +7 % | 3.48 / 3.91 / 3.00 | 3.67 / 4.11 / 3.23 | 0 / 0 / 0 |
| sp-231MB | IFC | 231.4 | 20.78 | 25.44 | 21.05 | −18 % | −1 % | 1.43 / 1.54 / 1.27 | 5.75 / 7.45 / 5.37 | 2,480 / 1,075 / 2,264 |
| D3D | IFC | 213.6 | 64.22 | 68.33 | 63.65 | −6 % | +1 % | 1.50 / 1.54 / 1.30 | 10.65 / 12.29 / 9.96 | 4,681 / 1,055 / 4,421 |
| BLSN_007 | STEP | 268.6 | 28.34 | 28.97 | 27.03 | −2 % | +5 % | 6.14 / 5.88 / 5.44 | 5.91 / 5.60 / 5.25 | 0 / 0 / 0 |
| DOWA | IFC | 398.4 | 26.40 | 35.53 | 25.20 | −26 % | +5 % | 6.65 / 10.70 / 6.07 | 9.83 / 11.91 / 9.15 | 1,502 / 0 / 1,074 |
| PSB | IFC | 860.7 | 39.05 | 43.89 | 35.48 | −11 % | +10 % | 4.33 / 3.99 / 2.98 | 17.73 / 19.06 / 14.82 | 2,179 / 651 / 1,930 |

- **The default is faster than forced windowed on every model**, by 6–32 %
  on the IFCs and 17 % on DSA2; BLSN_007 is within noise (−2 %, n = 2), as
  the first matrix found for STEP on this model's arm pair once the
  window-LRU fix landed (−7 % then). It is 1–10 % slower than plain
  buffered: the source hash for the sidecar, the sidecar export, and the
  page's sliced hash (below), all of which plain buffered skips.
- **Index sooner, more previews** on every IFC: the index lands 0.1–2.1 s
  earlier than windowed, with 2–7× the preview meshes at the index on the
  large IFCs, as the first matrix found for the buffered arms.
- **First mesh: the sync-handle read fixed the open's share, not all of
  it.** "Opening model" is 0.93 s `policyDefault` against 0.48 plain
  buffered and 0.55 windowed on PSB (the one read through the handle,
  ~0.4 s), where the prototype's Blob-store read made it 1.25 against 0.36
  in the 1645 run (+0.9). On the models ≤ 400 MiB the open costs 0.0–0.2 s
  more than plain buffered. But the page's sliced cache-key hash still runs
  first: "Hashing model" 3.25 s against plain buffered's 2.36 (one
  ArrayBuffer) on PSB. Together, PSB's first mesh is 4.33 s against 2.98
  plain buffered and **3.99 windowed: 0.3 s later than windowed**, the one
  model where the policy draws later; on sp-231MB, D3D and DOWA it draws as
  soon as or before windowed. The hash is a named follow-up (engine-worker.md
  §5.6).
- On BLSN_007 the first mesh is 0.3 s later than windowed (6.14 against
  5.88), inside STEP's spread at n = 2; STEP draws nothing before its index
  on any arm, as before.

### (d) Reopens: unchanged

| Model | Artifact hit, `policyDefault` / `windowedHandle` (s) | Sidecar reopen, `policyDefault` / `windowedHandle` (s) |
|---|---|---|
| MB-Khaya | 0.25 / 0.24 | 6.28 / 6.42 |
| DSA2 | 0.23 / 0.19 | 7.98 / 7.61 |
| sp-231MB | 3.40 / 3.14 | 21.68 / 20.95 |
| D3D | 3.95 / 3.64 | 64.41 / 63.69 |
| BLSN_007 | 0.50 / 0.51 | 24.12 / 24.15 |
| DOWA | 2.37 / 2.49 | 27.17 / 25.88 |
| PSB | 3.76 / 3.86 | 28.92 / 30.01 |

- A sidecar saved by a **buffered** parse reopens exactly as one saved by
  a windowed parse: windowed from the index, `Engine source: windowed
  (index reopen)`, the same time within noise, and the same tree and
  property read (42 of 42).
- As the first matrix found, the sidecar reopen pages its geometry windowed,
  so against the policy's cold load it is slower on MB-Khaya (+28 %),
  sp-231MB (+4 %) and DOWA (+3 %), equal on D3D, and faster on DSA2
  (−9 %), BLSN_007 (−15 %) and PSB (−26 %). Buffered geometry over a
  sidecar index is the follow-up that would close it (engine-worker.md
  §5.6).

**What this does not show.** Firefox and Safari (only their path is
reachable here, through `disableEngineSyncHandle`, and this run did not
measure it; `heldBuffer` in the runs above is that path); a real GPU; a
device with less memory than this container (every load here was far under
its cap); iOS.


## After conway 1.1645.781 (2026-11-11)

Share's conway pin moved from `1.1643.778-g5233308a` to
`1.1645.781-g15220b10`, which brings two fixes:
[conway#780](https://github.com/bldrs-ai/conway/pull/780) (the windowed
source provider's LRU recency became an O(1) stamp write; it was a `Map`
delete+set on each of ~9.6 M `acquire` calls on PSB) and
[conway#781](https://github.com/bldrs-ai/conway/pull/781) (a buffered open's
source is released on `SpillModelSource`, IFC and AP214, and
`invalidate(true)` rebuilds complex records' sub-entities). This section
re-measures seven of the 13 models on the arms those fixes touch:
`windowedHandle`, `buffered`, `heldBuffer` everywhere, plus `windowedHeld`
on PSB. The first matrix above is "before"; nothing above this section was
changed.

**Setup differences from the first matrix.** Product code is Share
`f2d55cd` (the first matrix's `7924244` plus the pin; the commits between
touch only `tools/bench/` and docs). Same machine, Chromium, build config,
harness and contention guard. Records are in
`tools/measure/sourceModes/records-conway-1645.jsonl`, kept apart from the
first matrix's `records.jsonl` (both git-ignored). **Confounder: the two
runs were hours apart** (before: 05:52–08:15 UTC; after: from 08:47 UTC,
same day), on a container shared with other sessions' work. Same-arm
differences of a few percent between the two runs are inside what that
alone can move; read only differences larger than both runs' ranges.

**Status (2026-11-11):** done. 7 models, 150 records, none failed, every
one passed its arm check, no trial contended, and every cold load's tree
and property signature matches the first matrix's. n as planned, nothing
cut: MB-Khaya 5; DSA2, sp-231MB, D3D and PSB 3; BLSN_007 and DOWA 2.

### What moved and what didn't

**(a) Worker memory after the spill, buffered arms: unchanged.** The
buffered arms still keep the source after the spill, by the same amount
as before, on every model that showed it:

| Model | Format | MiB | Before: buffered / windowed (MiB) | After: buffered / windowed (MiB) | Excess before → after |
|---|---|---|---|---|---|
| MB-Khaya | IFC | 31.4 | 59 / 59 | 55 / 55 | 0 → 0 |
| DSA2 | STEP | 105.7 | 199 / 199 | 167 / 167 | 0 → 0 |
| D3D | IFC | 213.6 | 371 / 355 | 306 / 290 | +16 → +16 |
| sp-231MB | IFC | 231.4 | 321 / 153 | 305 / 137 | +168 → +168 |
| BLSN_007 | STEP | 268.6 | 419 / 211 | 355 / 147 | +208 → +208 |
| DOWA | IFC | 398.4 | 530 / 387 | 518 / 375 | +143 → +143 |
| PSB | IFC | 860.7 | 1,096 / 300 | 1,093 / 296 | +796 → +797 |

(`buffered` and `heldBuffer` read the same on every model, before and
after; "windowed" is `windowedHandle`.) A worker heap snapshot names the
retainer, and it is Share's, not conway's: `engineHandler.js#openModel`'s
closure scope, held by the `settings` callbacks conway keeps on the model
([Why the buffered arms still retain the source](#why-the-buffered-arms-still-retain-the-source)).
On every IFC the excess is the file minus the windowed arm's window, to
within 2–11 MiB. What did move is the same on every arm, windowed
included: backing store after spill −4 to −65 MiB, and on STEP the
worker's JS heap after spill −155 MiB (DSA2) and −431 MiB (BLSN_007).

**(b) Windowed time: no movement attributable to conway#780.** Cold
engine time, before → after (median, n), and the buffered gap:

| Model | windowedHandle | buffered | heldBuffer | Gap buffered vs windowed, before → after |
|---|---|---|---|---|
| MB-Khaya | 5.94 → 5.81 | 3.39 → 3.55 | 3.52 → 3.70 | −43 % → −39 % |
| DSA2 | 8.26 → 7.55 | 6.77 → 7.07 | 7.35 → 7.03 | −18 % → −6 % |
| sp-231MB | 20.38 → 20.15 | 15.41 → 16.57 | 16.72 → 16.60 | −24 % → −18 % |
| D3D | 55.27 → 60.53 (bimodal) | 43.70 → 43.57 | 43.39 → 43.42 | −21 % → −28 % |
| BLSN_007 | 23.33 → 22.87 | 20.98 → 21.35 | 22.21 → 22.16 | −10 % → −7 % |
| DOWA | 27.08 → 26.25 | 21.21 → 20.07 | 24.25 → 21.10 | −22 % → −24 % |
| PSB | 36.45 → 34.55 | 30.24 → 28.58 | 32.26 → 31.09 | −17 % → −17 % |

- The windowed arm's medians are lower on six of seven models (−0.1 to
  −1.9 s; D3D is the exception, two slow loads the guard didn't explain),
  but only BLSN_007's (−0.46 s, n = 2) has ranges clear of before's and
  of the other arms' own drift. On PSB, where conway#780's ~9.6 M
  `acquire` calls are, every arm got faster by about the same amount:
  `windowedHandle` −1.9 s, `windowedHeld` −1.6, `buffered` −1.7,
  `heldBuffer` −1.2, all four with ranges clear of before's. A change
  that only touches the windowed provider
  can't speed up the buffered arm, so on PSB the move is the run, not
  the pin, and the gap is −5.97 s against −6.21 s before: unchanged.
- **The buffered-vs-windowed gap remains on every model where it was
  measurable**: IFC −17 to −39 % (−2.3 s on MB-Khaya to −6.0 s on PSB),
  STEP −6 % (DSA2, now inside the noise) and −7 % (BLSN_007). The DSA2
  and sp-231MB gaps narrowed through the buffered arm reading slower,
  not the windowed one faster.
- Parse and Geometry, windowed: PSB 11.58 / 19.63 s (12.08 / 20.75
  before); DSA2 2.07 / 4.82 (2.08 / 5.13); sp-231MB 4.47 / 14.21 (4.50 /
  14.18); BLSN_007 3.55 / 17.92 (3.55 / 18.51).

**(c) Peak memory, buffered against windowed: unchanged.** PSB renderer
peak RSS 6,402 MiB `buffered` and 6,408 `heldBuffer` against 4,580
`windowedHandle` and 5,444 `windowedHeld` (before 6,413 / 6,412 / 4,620 /
5,505): still ~1.8 GiB above windowed. Worker backing-store peak (un-GC'd
polls): 1,243 / 1,390 against 1,341 / 2,414 (before 1,243 / 1,389 /
1,083 / 2,326). One traced load per arm on PSB (250 ms samples of the
renderer's `VmRSS` and `VmHWM` and the worker's heap usage, with the
report's stage times; a scratch script, not the harness) says when the
peak happens:

- **On every arm the peak is in the GLB writer's window, after Total:**
  at Total + 8.8 s on `buffered` (6,120 MiB), + 8.4 s on `heldBuffer`
  (6,346), + 8.8 s on `windowedHandle` (5,516; this one load peaked well
  above the bench's 4.6 GB median, so a single trace bounds the windowed
  peak loosely).
- **The plain `buffered` arm's main-thread copy is not the peak.** Its
  `Buffering model bytes` stage takes the renderer to 2,929 MiB at 8.9 s,
  well under its later peak; `heldBuffer`, which has no such copy, peaks as
  high. That is why the two read the same.
- **Going into the writer, the buffered arms' worker still holds the
  source**: worker backing store 1,093–1,389 MiB through the writer
  against 457–697 windowed, measured. That is the retained source of (a),
  and it is in the renderer's RSS at the moment the peak is reached.
- What the trace can't say: how much of the ~1.8 GiB HWM gap the retained
  source accounts for. Sampled at 250 ms, the traced peaks differ by
  0.6–0.8 GiB, not 1.8, so short spikes between samples carry the rest,
  and one trace per arm doesn't separate them from load-to-load spread.
  That the retained source is the excess is consistent with everything
  measured; that releasing it would close the gap is not measured.

**(d) Why `heldBuffer` draws its first mesh late.** The first mesh lands
~0.1 s after the Parsing stage starts on every arm of every large IFC, so
the whole difference is before the parse, in two stages:

| Model | Arm | n | Page hash stage (s) | Opening model (s) | Parse starts (s after open) | 1st mesh (s) |
|---|---|---|---|---|---|---|
| PSB | buffered | 3 | 2.06 | 0.36 | 2.42 | 2.52 |
| PSB | heldBuffer | 3 | 2.67 | 1.25 | 3.92 | 4.02 |
| PSB | windowedHandle | 3 | 2.55 | 0.42 | 2.96 | 3.14 |
| PSB | windowedHeld | 3 | 2.49 | 1.27 | 3.75 | 4.04 |
| sp-231MB | buffered | 3 | 0.56 | 0.39 | 0.99 | 1.06 |
| sp-231MB | heldBuffer | 3 | 0.68 | 0.66 | 1.35 | 1.47 |
| sp-231MB | windowedHandle | 3 | 0.73 | 0.38 | 1.11 | 1.25 |
| D3D | buffered | 3 | 0.52 | 0.37 | 0.88 | 1.02 |
| D3D | heldBuffer | 3 | 0.66 | 0.64 | 1.29 | 1.43 |
| D3D | windowedHandle | 3 | 0.66 | 0.44 | 1.05 | 1.25 |

- **Opening model, +0.9 s on PSB (+0.3 s on sp-231MB and D3D):** the Blob
  store reads the whole file into the worker before the open
  (`engineSources.js#holdResident`, `blob.arrayBuffer()`), on both arms
  that use it: `windowedHeld`'s Opening is the same 1.27 s. The sync
  handle and the buffered transfer don't.
- **The page's cache-key hash, +0.6 s on PSB against buffered:** the
  buffered path reads the file into one ArrayBuffer and hashes it
  (`Buffering model bytes`, Loader.js); every other arm hashes the File in
  slices (`Hashing model`), which is slower. `windowedHandle` pays it too
  (2.55 s), so it is not `heldBuffer`'s own cost, but it is part of why
  `heldBuffer` is later than plain buffered.
- **Not the source hash.** `RECORD_SOURCE_HASH` runs inside the parse
  (`heldBuffer`'s Parse is 1.6 s longer than buffered's on PSB) and the
  first mesh comes 0.1 s into the parse on both arms, so it costs total
  time, not first pixels.
- These are the new run's numbers; the first matrix's PSB records show
  the same split (round 1: hash 2.66 against 2.03 s buffered, Opening
  1.39 against 0.34, first mesh 0.09 and 0.11 s after the parse started).
  On DOWA, BLSN_007 and DSA2 the first mesh comes 2–6 s into the parse on
  every arm, so the pre-parse split is not what orders them there.

**(e) Reopen paths.** Artifact hits are unchanged within noise (PSB 3.06 /
2.88 s against 3.19 / 3.15). Sidecar reopens read faster on the large
models, `heldBuffer`'s most: PSB 23.06 against 25.83 s (ranges
22.58–25.43 against 25.63–26.02, overlapping at the top), sp-231MB 16.70
against 17.79 (disjoint), BLSN_007 and DOWA within noise;
`windowedHandle`'s PSB sidecar reopen 22.31 against 23.49 (disjoint). The
sidecar reopen pages windowed, so it is where conway#780 could show; on
PSB it moved less than the cold buffered arm's drift (−1.7 s), so it is
not separable from the run. Every sidecar reopen (21 of 21 `heldBuffer`,
21 of 21 `windowedHandle`) opened from the index and matched its cold
load's tree and property read, as before. BLSN_007's artifact hit peaks ~500 MiB lower in the renderer
(1,714 against 2,239).

**Confounders.** The two runs are hours apart on a shared container; the
first ran 05:52–08:15 UTC, this one 08:47–10:41. Two models show
Geometry-only slow loads the contention guard did not see (D3D: two
`windowedHandle` loads +6 s and one `buffered` +9.6 s; DOWA: one load per
arm +4 s), so a same-arm difference under ~5 % on one run is not a
finding. Records carry `shareCommit` `f2d55cd`, `bfcc2d3` or `b6b81c7`
(the commits after `f2d55cd` touch only this doc), and PSB's 24 records
carry `shareDirty: true`: the harness stamps identity when an invocation
starts, and PSB's started while this doc had uncommitted edits; the
product code is the same on all of them. Doc commits (and their
pre-commit hook) ran under the bench lock, between rounds. The two heap snapshots and the three
traces ran under the same lock, between bench rounds, outside the
records.

### MB-Khaya (IFC, 31.4 MiB), n = 5

Nothing moved outside the noise. Cold engine time `windowedHandle` 5.81 s
(before 5.94), `buffered` 3.55 (3.39), `heldBuffer` 3.70 (3.52): the
buffered arms read +0.16–0.18 s, with overlapping ranges, and the windowed
arm −0.13 s; Geometry 4.50 against 4.70 windowed. The buffered-vs-windowed
gap is −2.26 s (−39 %), against −2.55 s (−43 %) before. After the spill
every arm reads 55 MiB (59 before, every arm alike): this model showed no
retention before and shows none now. First mesh 1.30 / 1.00 / 1.20 s
(before 1.31 / 0.99 / 1.14). Both reopen paths are within noise of before.

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 5 | 5.81 (5.62–5.94) | 0.71 (0.68–0.76) | 4.50 (4.40–4.68) | 1.30 (1.19–1.33) | 1.48 (1.35–1.51) | 6.36 (6.17–6.44) | 0 | 17 (15–17) | 3.09 (3.01–3.22) | 82 (82–102) | 52 | 55 | 17 | 100 | 1003 (994–1028) |
| windowedHandle | artifact hit | 5 | 0.21 (0.18–0.30) | — | — | 0.41 (0.38–0.49) | — | 0.38 (0.35–0.46) | — | 7 (5–9) | 0.96 (0.84–1.11) | — | — | — | — | — | 754 (747–780) |
| windowedHandle | sidecar reopen | 5 | 5.23 (5.04–5.29) | 0.17 (0.15–0.20) | 4.58 (4.41–4.64) | 0.69 (0.62–0.72) | 0.85 (0.78–0.86) | 5.75 (5.51–5.80) | 0 | 13 (13–14) | 2.46 (2.36–2.50) | 84 (70–84) | 52 (52–84) | 55 | 17 | 100 | 1002 (985–1040) |
| buffered | cold | 5 | 3.55 (3.38–3.80) | 0.50 (0.46–0.57) | 2.58 (2.43–2.80) | 1.00 (0.80–1.10) | 1.19 (1.01–1.31) | 4.12 (3.87–4.33) | 0 (0–1) | 14 (14–15) | 2.62 (2.41–2.82) | 70 (69–73) | 57 (56–66) | 55 | 17 (17–17) | 100 | 991 (817–996) |
| heldBuffer | cold | 5 | 3.70 (3.53–3.73) | 0.52 (0.47–0.55) | 2.52 (2.44–2.64) | 1.20 (1.03–1.28) | 1.29 (1.23–1.41) | 4.21 (4.01–4.23) | 0 (0–1) | 15 (14–15) | 2.61 (2.52–2.71) | 83 (82–86) | 57 (56–67) | 55 | 17 | 100 | 1000 (961–1003) |
| heldBuffer | artifact hit | 5 | 0.24 (0.20–0.36) | — | — | 0.43 (0.40–0.60) | — | 0.40 (0.38–0.57) | — | 7 (7–8) | 0.99 (0.98–1.13) | — | — | — | — | — | 782 (744–784) |
| heldBuffer | sidecar reopen | 5 | 5.30 (5.12–5.63) | 0.17 (0.16–0.17) | 4.60 (4.47–4.96) | 0.85 (0.75–0.88) | 0.84 (0.81–1.02) | 5.85 (5.65–6.16) | 0 | 15 (12–16) | 2.53 (2.41–2.73) | 100 (100–104) | 83 (83–104) | 55 | 17 | 100 | 1031 (972–1070) |

### DSA2 (STEP, 105.7 MiB), n = 3

- **Windowed cold: 7.55 s against 8.26 before (−0.71 s, −9 %)**, Geometry
  4.82 against 5.13, Parse unchanged (2.07). The ranges overlap (7.43–8.16
  against 7.98–9.03), so at n = 3 this is a direction, not a measured gain.
  The buffered arms did not move outside noise (`buffered` 7.07 against
  6.77, `heldBuffer` 7.03 against 7.35). The buffered-vs-windowed gap is
  −0.48 s (−6 %, ranges overlapping), against −1.49 s (−18 %, disjoint)
  before.
- **After the spill:** backing store 167 MiB on every arm (199 before,
  every arm alike), and **the worker's JS heap after spill fell from 286 to
  131 MiB on every arm**, windowed included. DSA2 showed no buffered-only
  retention before and shows none now; the heap drop is new and is not
  arm-specific.
- First mesh within noise of before on every arm (2.92 / 2.72 / 2.87 s).
  Sidecar reopen −0.1 to −0.3 s, within or at the edge of noise.
- The tree and property-read signature of every cold load matches the
  first matrix's (1 node; the property hash of leaf 5 is unchanged), and
  every `heldBuffer` sidecar reopen matched its cold load.

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 3 | 7.55 (7.43–8.16) | 2.07 (2.04–2.12) | 4.82 (4.52–5.28) | 2.92 (2.84–2.97) | 3.10 (3.00–3.15) | 8.55 (8.40–9.07) | 0 | 22 (21–23) | 4.10 (3.98–4.21) | 382 (301–382) | 366 (133–370) | 167 | 131 | 83 | 1534 (1519–1791) |
| windowedHandle | artifact hit | 3 | 0.18 (0.17–0.18) | — | — | 0.46 (0.46–0.47) | — | 0.41 (0.41–0.42) | — | 6 (5–6) | 1.09 (0.99–1.10) | — | — | — | — | — | 1270 (1241–1274) |
| windowedHandle | sidecar reopen | 3 | 5.84 (5.79–5.93) | 0.70 (0.70–0.71) | 4.67 (4.58–4.70) | 1.29 (1.28–1.30) | 1.44 (1.43–1.45) | 6.69 (6.67–6.83) | 0 | 16 (15–17) | 2.99 (2.93–3.07) | 417 (407–419) | 395 (361–407) | 167 | 131 | 83 | 1406 (1402–1458) |
| buffered | cold | 3 | 7.07 (6.56–7.20) | 1.95 (1.92–2.02) | 4.41 (3.87–4.50) | 2.72 (2.63–2.77) | 2.90 (2.79–2.93) | 7.87 (7.42–8.12) | 0 | 22 (21–23) | 4.08 (4.06–4.25) | 243 (235–247) | 171 (171–201) | 167 | 131 (131–131) | 83 | 1636 (1324–1662) |
| heldBuffer | cold | 3 | 7.03 (6.97–7.79) | 1.82 (1.81–1.86) | 4.27 (4.25–4.95) | 2.87 (2.76–2.92) | 3.04 (2.94–3.12) | 7.96 (7.91–8.71) | 0 | 23 (22–23) | 4.15 (3.76–4.52) | 275 | 171 (171–175) | 167 | 131 | 83 | 1728 (1656–1746) |
| heldBuffer | artifact hit | 3 | 0.16 (0.16–0.19) | — | — | 0.45 (0.43–0.46) | — | 0.40 (0.38–0.42) | — | 6 (5–7) | 0.98 (0.95–1.06) | — | — | — | — | — | 1209 (1204–1231) |
| heldBuffer | sidecar reopen | 3 | 6.09 (5.99–6.35) | 0.74 (0.69–0.80) | 4.77 (4.67–4.93) | 1.42 (1.41–1.54) | 1.58 (1.57–1.70) | 7.06 (6.86–7.23) | 0 | 16 (15–16) | 3.04 (3.02–3.25) | 518 (518–526) | 518 | 167 | 131 | 83 | 1531 (1519–1612) |

### sp-231MB (IFC, 231.4 MiB), n = 3

- **The buffered arms still retain the source after the spill: 305 MiB for
  `buffered` and `heldBuffer` against 137 for `windowedHandle`, +168 MiB,
  the same excess as before (321 against 153).** Every arm fell by 16 MiB;
  the gap did not move. Both buffered arms logged `released resident
  source buffer (242683483B)`. See
  [Why the buffered arms still retain the source](#why-the-buffered-arms-still-retain-the-source)
  for the heap snapshot.
- **Time:** windowed cold 20.15 s (before 20.38), within noise; Geometry
  14.21 against 14.18. `heldBuffer` 16.60 (16.72). `buffered` 16.57 s
  against 15.41 before (+1.16 s, Geometry 12.22 against 11.01, ranges
  disjoint at n = 3): a same-arm move between two runs hours apart on a
  path neither conway change targets; read it as run-to-run drift until a
  second run says otherwise. The gap is −3.6 s (−18 %) against −5.0 s
  (−24 %) before, and that change is entirely the `buffered` arm's drift.
- **Reopen:** `heldBuffer`'s sidecar reopen is 16.70 s against 17.79
  (−1.1 s, disjoint) and its artifact hit 2.13 against 2.49;
  `windowedHandle`'s sidecar reopen 16.66 against 17.31 (overlapping).
- First mesh and previews: within noise (1.25 / 1.06 / 1.47 s).
  Signatures match the first matrix; every `heldBuffer` sidecar reopen
  matched its cold load.

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 3 | 20.15 (19.73–20.42) | 4.47 (4.34–4.55) | 14.21 (13.75–14.62) | 1.25 (1.15–1.25) | 5.88 (5.76–6.05) | 23.07 (22.32–23.50) | 1879 (1879–1892) | 32 (29–35) | 10.28 (9.73–10.82) | 1033 (1033–1042) | 593 (591–593) | 137 | 57 | 515 | 4166 (3857–4169) |
| windowedHandle | artifact hit | 3 | 2.20 (2.17–2.30) | — | — | 2.60 (2.54–2.66) | — | 2.57 (2.52–2.63) | — | 8 (7–9) | 3.06 (2.92–3.28) | — | — | — | — | — | 3947 (3634–3950) |
| windowedHandle | sidecar reopen | 3 | 16.66 (16.55–17.16) | 1.62 (1.58–1.68) | 14.19 (14.11–14.66) | 2.27 (2.15–2.28) | 2.52 (2.35–2.53) | 19.31 (18.97–19.82) | 0 | 21 (20–23) | 7.62 (7.38–8.07) | 994 (909–1025) | 935 (833–986) | 137 | 57 | 515 | 4060 (4020–4179) |
| buffered | cold | 3 | 16.57 (16.04–17.02) | 3.08 (3.07–3.38) | 12.22 (11.29–12.61) | 1.06 (1.02–1.14) | 4.30 (4.23–4.54) | 19.40 (18.82–19.76) | 2363 (2277–2402) | 27 (26–29) | 10.15 (9.15–10.29) | 361 | 310 (308–310) | 305 | 57 | 515 | 3932 (3915–4034) |
| heldBuffer | cold | 3 | 16.60 (16.59–16.75) | 3.50 (3.47–3.59) | 11.40 (11.38–11.51) | 1.47 (1.39–1.49) | 4.98 (4.94–5.01) | 19.35 (19.13–19.46) | 2946 (2572–3118) | 28 (27–28) | 8.41 (8.33–9.60) | 417 (417–418) | 308 (308–308) | 305 | 57 (57–57) | 515 | 3969 (3922–4349) |
| heldBuffer | artifact hit | 3 | 2.13 (2.02–2.22) | — | — | 2.49 (2.38–2.59) | — | 2.47 (2.36–2.56) | — | 7 (6–10) | 2.92 (2.77–3.17) | — | — | — | — | — | 3746 (3697–4123) |
| heldBuffer | sidecar reopen | 3 | 16.70 (16.69–16.80) | 1.67 (1.53–1.72) | 14.16 (13.99–14.22) | 2.37 (2.33–2.47) | 2.62 (2.54–2.72) | 19.34 (18.70–19.48) | 0 | 24 (22–29) | 7.67 (7.57–8.55) | 1214 (1209–1282) | 952 (819–979) | 137 | 57 | 515 | 4343 (3981–4398) |

### Why the buffered arms still retain the source

A GC'd heap snapshot of the Engine worker (CDP `HeapProfiler.takeHeapSnapshot`
on the worker target, 2 s after the spill line and two
`HeapProfiler.collectGarbage` calls), one `buffered` and one `heldBuffer`
load of sp-231MB, the smallest model in this set that shows the excess.
Backing store at the snapshot: 319.6 MB (305 MiB) on both, as in the bench.
The 231.4 MiB `JSArrayBufferData` (exactly the file) is alive, and **its
only JS retainer is Share's, not conway's**:

```
(GC roots) → Engine.worker.js global → … → engine handler state
  → models (Map) → [the model] → .settings → .ON_PROGRESS (closure)
    → .context  (openModel's scope, engineHandler.js)
      → `source` {bytes}  → .bytes   → ArrayBuffer (231.4 MiB)   [buffered]
      → `heldBytes`       → Uint8Array → ArrayBuffer (231.4 MiB)  [heldBuffer]
```

The same context is also held through `.ON_MODEL_INFO`, `.ON_PREVIEW_MESH`
and the model's `progressTracker_.onProgress`. Names are minified in the
snapshot (`Me` for `source`, `cr` for `heldBytes`); the mapping to
`engineHandler.js#openModel` is by shape: the closures named
`ON_PROGRESS`/`ON_MODEL_INFO` and the unnamed preview closure are the ones
`openModel` puts on `settings`, and their scope holds a `{bytes}` object
(buffered) or a `Uint8Array` (heldBuffer). In `openModel`, the `loadBytes`
closure references `source` and `heldBytes`, so V8 allocates both in the
function's one shared context, and every closure created there, including
the `settings` callbacks conway keeps on the model for the session, keeps
that context, and with it the file, alive. conway's spill drops its own
references (conway#781 removed those); this one is outside conway.

**The arithmetic fits on every IFC, before and after the pin:** the
buffered arms' after-spill excess over `windowedHandle` is the file minus
the windowed arm's window (the Geometry line's `window=`), within 2–11 MiB:

| Model | File (MiB) | Window (MiB) | File − window | Excess before | Excess after |
|---|---|---|---|---|---|
| sp-231MB | 231.4 | 61.0 | 170 | 168 | 168 |
| D3D | 213.6 | 188.5 | 25 | 16 | 16 |
| DOWA | 398.4 | 244.1 | 154 | 143 | 143 |
| PSB | 860.7 | 57.9 | 803 | 796 | 797 |

That is, on IFC the buffered arms keep the whole file after the spill, the
windowed arm keeps its window, and the difference is what was measured.
The conway retainers conway#781 removed were real (the earlier snapshot's
path ran through `IfcApiProxyIfc.demandAggregates_`), but this Share
retainer holds the same buffer, so removing them freed nothing measurable.
STEP is not covered by the arithmetic (its Geometry line has no
`window=`); the STEP models are in their own sections.

### D3D (IFC, 213.6 MiB), n = 3

- **After the spill:** 306 MiB both buffered arms against 290 windowed,
  +16 MiB, the same as before (371 against 355); every arm −65 MiB. On
  D3D the window (188.5 MiB) is nearly the file, so the retained source
  shows as only +16.
- **Time: the windowed arm was bimodal.** `windowedHandle` cold read 54.36,
  60.53 and 61.52 s (Geometry 47.0, 53.6, 54.4; slow in rounds 1 and 2,
  fast in round 3); before, 54.54–55.39. `buffered` read 53.14, 43.23 and
  43.57 s, the slow one in round 1, right after round 1's slow windowed
  load. The contention guard saw no other process (0.03–0.05 busy cores)
  on any of them. The extra time is all in Geometry, and the fast loads
  match the first matrix; this is not a measured effect of the pin,
  and at n = 3 it can't be told from host-level noise the guard can't see.
  `heldBuffer` 43.42 (43.39 before), unchanged.
- Sidecar reopen and artifact hit within noise of before on both arms.
  First mesh unchanged (1.25 / 1.02 / 1.43 s). Signatures match.

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 3 | 60.53 (54.36–61.52) | 5.40 (5.40–5.57) | 53.56 (47.00–54.35) | 1.25 (1.22–1.41) | 9.54 (9.47–9.77) | 70.74 (65.19–71.36) | 1127 (1033–1156) | 46 (41–47) | 34.46 (32.03–34.81) | 583 (564–633) | 427 (423–435) | 290 | 257 | 611 | 4685 (3737–5040) |
| windowedHandle | artifact hit | 3 | 2.93 (2.87–2.93) | — | — | 5.10 (5.00–5.16) | — | 5.07 (4.97–5.13) | — | 10 (9–10) | 5.64 (5.41–5.65) | — | — | — | — | — | 2425 (1938–3282) |
| windowedHandle | sidecar reopen | 3 | 50.68 (49.89–52.86) | 1.77 (1.60–1.81) | 48.07 (47.11–50.05) | 5.68 (5.58–5.83) | 5.40 (5.28–5.51) | 61.16 (60.68–62.68) | 0 | 32 (31–40) | 30.94 (29.73–31.44) | 547 (496–550) | 422 (422–435) | 290 | 257 (257–257) | 611 | 4347 (4197–4863) |
| buffered | cold | 3 | 43.57 (43.23–53.14) | 4.21 (4.10–4.43) | 38.04 (37.50–47.23) | 1.02 (0.96–1.11) | 8.14 (7.88–8.15) | 54.30 (53.71–63.97) | 4681 (4495–4681) | 38 (33–41) | 25.59 (24.01–33.76) | 629 (464–637) | 385 (385–386) | 306 | 257 | 611 | 4999 (4723–5068) |
| heldBuffer | cold | 3 | 43.42 (42.57–44.57) | 4.43 (4.29–4.50) | 37.01 (36.59–38.24) | 1.43 (1.14–1.43) | 8.68 (8.43–8.78) | 54.01 (53.08–55.11) | 4681 | 35 (34–37) | 26.78 (23.64–28.15) | 633 (633–669) | 344 (343–386) | 306 | 257 | 611 | 5092 (5011–5124) |
| heldBuffer | artifact hit | 3 | 3.03 (2.92–3.24) | — | — | 5.19 (5.02–5.45) | — | 5.16 (4.99–5.42) | — | 10 (9–10) | 5.70 (5.47–5.92) | — | — | — | — | — | 3630 (3257–3653) |
| heldBuffer | sidecar reopen | 3 | 51.27 (49.37–54.70) | 1.90 (1.72–1.94) | 48.08 (46.48–51.55) | 6.28 (5.82–6.47) | 5.96 (5.52–6.17) | 62.72 (59.12–65.75) | 0 | 32 (31–35) | 31.47 (28.25–32.99) | 764 (732–825) | 636 | 290 | 257 | 611 | 4934 (4882–5211) |

### BLSN_007 (STEP, 268.6 MiB), n = 2

- **After the spill: 355 MiB both buffered arms against 147 windowed,
  +208 MiB, the same excess as before (419 against 211).** Every arm fell
  64 MiB. STEP's Geometry line carries no `window=`, so the arithmetic
  check above doesn't apply; 268.6 − 208 = 61 MiB is what the windowed STEP
  arm would have to keep for the same explanation to hold, about the IFC
  default window (61.0 MiB on sp-231MB), but that is inferred, not
  measured. The STEP case was not snapshotted.
- **The worker's JS heap after the spill fell from 612 to 181 MiB on every
  arm** (−431 MiB), windowed included: the largest change in this
  re-measure, and on STEP only (DSA2 286 → 131; the IFCs moved 0–19 MiB).
  conway#781's AP214 changes are the likely cause; these records can't say
  which part.
- **Time:** windowed cold 22.87 s against 23.33 (−0.46 s, Geometry 17.92
  against 18.51), disjoint at n = 2 (22.82–22.92 against 23.31–23.35);
  sidecar reopen 19.05 against 19.96, also disjoint. Buffered arms
  unchanged (21.35 / 22.16 against 20.98 / 22.21). The buffered-vs-windowed
  gap is −1.52 s (−7 %) against −2.35 s (−10 %).
- First mesh unchanged (5.13 / 4.30 / 4.97 s); still no preview meshes
  before the index on any arm. Renderer peak RSS on the artifact hit fell
  ~500 MiB (1,714 / 1,783 against 2,239 / 2,293). Signatures match; both
  `heldBuffer` sidecar reopens matched their cold load.

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 2 | 22.87 (22.82–22.92) | 3.55 (3.40–3.69) | 17.92 (17.66–18.17) | 5.13 (4.99–5.27) | 5.06 (4.67–5.45) | 23.32 (23.25–23.39) | 0 | 44 | 7.23 (7.10–7.36) | 705 | 225 (186–265) | 147 | 181 | 429 | 2783 (2781–2784) |
| windowedHandle | artifact hit | 2 | 0.39 (0.36–0.42) | — | — | 0.55 (0.51–0.59) | — | 0.52 (0.48–0.55) | — | 7 (6–8) | 1.09 (0.98–1.20) | — | — | — | — | — | 1714 (1698–1730) |
| windowedHandle | sidecar reopen | 2 | 19.05 (18.84–19.27) | 0.94 (0.86–1.03) | 17.59 (17.50–17.68) | 1.69 (1.59–1.79) | 1.50 (1.39–1.61) | 19.44 (19.26–19.63) | 0 | 31 (29–33) | 5.69 (5.57–5.81) | 614 (612–616) | 334 (302–367) | 147 | 181 (181–181) | 429 | 2825 (2808–2842) |
| buffered | cold | 2 | 21.35 (20.86–21.84) | 3.02 (2.90–3.14) | 17.17 (16.85–17.50) | 4.30 (4.19–4.41) | 4.18 (4.11–4.24) | 21.80 (21.25–22.35) | 0 | 43 (41–44) | 7.37 (7.15–7.59) | 420 (420–420) | 356 | 355 | 181 | 429 | 2364 (2168–2560) |
| heldBuffer | cold | 2 | 22.16 (21.98–22.34) | 3.21 (3.17–3.24) | 17.39 (17.22–17.55) | 4.97 (4.96–4.98) | 4.81 (4.81–4.81) | 22.59 (22.39–22.79) | 0 | 41 (40–42) | 7.05 (6.93–7.16) | 544 (544–544) | 357 | 355 | 181 | 429 | 2622 (2614–2630) |
| heldBuffer | artifact hit | 2 | 0.40 (0.38–0.43) | — | — | 0.55 (0.52–0.58) | — | 0.53 (0.50–0.55) | — | 9 (8–9) | 1.16 (1.11–1.22) | — | — | — | — | — | 1783 (1772–1794) |
| heldBuffer | sidecar reopen | 2 | 19.65 (19.48–19.82) | 0.90 (0.90–0.90) | 17.92 (17.81–18.03) | 2.03 (1.98–2.08) | 1.72 (1.67–1.78) | 20.02 (19.84–20.20) | 0 | 31 (30–31) | 5.63 (5.53–5.72) | 853 (833–873) | 505 (445–566) | 147 | 181 (181–181) | 429 | 3044 (3029–3059) |

### DOWA (IFC, 398.4 MiB), n = 2

- **After the spill: 518 MiB both buffered arms against 375 windowed,
  +143 MiB, the same as before (530 against 387)**, and the file minus the
  window (154 MiB) within 11.
- **Time: inside the noise.** Every arm has one load ~4 s slower than its
  other (all in Geometry: 11.2 against 15.4–15.7 s, or 15.3–15.7 against
  19.3–19.5), and the slow one is in round 1 for some arms and round 2 for
  others, with the guard seeing no other process; so the ranges are wide: windowed
  26.25 s (24.38–28.12) against 27.08 (26.14–28.01); `buffered` 20.07
  (18.02–22.12) against 21.21; `heldBuffer` 21.10 (18.87–23.32) against
  24.25. Windowed Parse is 6.65 against 7.13 s (disjoint, −0.5 s). Sidecar
  reopen 19.84 / 18.91 against 23.72 / 20.70, each pair's ranges
  overlapping or touching. At n = 2 none of the totals is a measured change.
- First mesh 7.30 / 4.40 / 6.05 s (before 8.00 / 5.92 / 6.29), and
  previews before the index 0–3,366 between rounds of one arm: as before,
  on DOWA neither separates the arms or the runs at n = 2. Signatures
  match; both `heldBuffer` sidecar reopens matched their cold load.

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 2 | 26.25 (24.38–28.12) | 6.65 (6.56–6.74) | 17.61 (15.68–19.55) | 7.30 (6.19–8.41) | 9.22 (9.22–9.22) | 31.18 (29.22–33.14) | 1074 (0–2147) | 44 (43–44) | 15.35 (14.05–16.64) | 1076 (1068–1084) | 769 (721–817) | 375 | 70 | 429 | 3889 (3844–3933) |
| windowedHandle | artifact hit | 2 | 1.96 (1.96–1.97) | — | — | 2.67 (2.66–2.67) | — | 2.59 (2.55–2.62) | — | 7 (6–7) | 2.96 (2.95–2.98) | — | — | — | — | — | 2879 (2713–3044) |
| windowedHandle | sidecar reopen | 2 | 19.84 (17.89–21.79) | 1.81 (1.80–1.82) | 17.28 (15.26–19.29) | 2.44 (2.43–2.46) | 3.17 (3.14–3.20) | 24.87 (22.63–27.12) | 0 | 25 (23–26) | 13.17 (11.31–15.04) | 1171 (1157–1185) | 591 (549–632) | 375 | 70 | 429 | 4290 (4289–4291) |
| buffered | cold | 2 | 20.07 (18.02–22.12) | 4.88 (4.85–4.90) | 13.34 (11.24–15.43) | 4.40 (3.72–5.08) | 7.09 (7.02–7.16) | 25.49 (23.53–27.44) | 2113 (860–3366) | 38 (34–41) | 14.34 (12.29–16.40) | 903 (864–942) | 594 | 518 | 70 | 429 | 4231 (4022–4439) |
| heldBuffer | cold | 2 | 21.10 (18.87–23.32) | 5.41 (5.40–5.43) | 13.48 (11.20–15.75) | 6.05 (5.52–6.58) | 8.11 (8.07–8.14) | 26.53 (24.05–29.01) | 967 (217–1716) | 41 (36–45) | 13.76 (11.23–16.29) | 893 (866–920) | 560 (527–594) | 518 | 70 | 429 | 4323 (4318–4328) |
| heldBuffer | artifact hit | 2 | 2.08 (1.95–2.22) | — | — | 2.73 (2.67–2.79) | — | 2.70 (2.63–2.77) | — | 8 (7–9) | 3.11 (3.09–3.13) | — | — | — | — | — | 3040 (2875–3204) |
| heldBuffer | sidecar reopen | 2 | 18.91 (17.81–20.01) | 1.97 (1.88–2.07) | 15.57 (14.81–16.33) | 3.16 (2.82–3.50) | 3.96 (3.59–4.33) | 23.95 (23.15–24.75) | 0 | 24 (22–26) | 10.92 (10.68–11.17) | 1507 (1451–1563) | 1139 (1011–1267) | 375 | 70 | 429 | 4510 (4230–4790) |

### PSB (IFC, 860.7 MiB), n = 3

Four arms (`windowedHeld` added, as the Firefox/Safari path); n = 3
against the first matrix's 2.

- **After the spill: 1,093 MiB both buffered arms against 296 for both
  windowed arms**, +797 MiB (before 1,096 against 300). Both buffered arms
  logged `released resident source buffer (902472037B)`. File minus window
  is 803 MiB.
- **Time: every arm 1.2–1.9 s faster than before, the buffered ones
  too** (`windowedHandle` 34.55 s against 36.45, `windowedHeld` 35.99
  against 37.62, `buffered` 28.58 against 30.24, `heldBuffer` 31.09
  against 32.26; ranges disjoint on all four). As the
  buffered arms don't run the code conway#780 changed, read the shift as
  the run's; the gap is −17 % as before (−5.97 s against −6.21 s), and
  `heldBuffer` is −10 % (−11 % before).
- First mesh 3.14 / 4.04 / 2.52 / 4.02 s (before 3.49 / 4.32 / 2.63 /
  4.27): the same order, see (d). Previews before the index 681 / 675 /
  2,167 / 2,534 (before 669 / 641 / 2,173 / 2,301).
- Peak memory: see (c). Renderer peak 4,580 / 5,444 / 6,402 / 6,408 MiB.
  (`heldBuffer`'s sidecar reopen reads 6,435 MiB against 5,449 before;
  the reopen phases share the cold load's process, so that is not an
  independent reading.)
- Sidecar reopen 22.31 / 23.06 s (23.49 / 25.83 before); artifact hit
  3.06 / 2.88 (3.19 / 3.15). Signatures match; all three `heldBuffer`
  sidecar reopens matched their cold load.

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 3 | 34.55 (33.18–35.14) | 11.58 (11.33–11.60) | 19.63 (18.83–20.31) | 3.14 (2.86–3.25) | 15.11 (14.54–15.17) | 38.02 (36.22–38.22) | 681 (673–708) | 53 (52–60) | 15.77 (15.08–16.07) | 1341 (985–1558) | 860 (855–864) | 296 | 27 | 899 | 4580 (4565–4595) |
| windowedHandle | artifact hit | 3 | 3.06 (2.98–3.17) | — | — | 3.36 (3.26–3.55) | — | 3.33 (3.23–3.51) | — | 9 (8–10) | 3.78 (3.61–3.93) | — | — | — | — | — | 3933 (3906–3960) |
| windowedHandle | sidecar reopen | 3 | 22.31 (22.18–23.02) | 2.87 (2.70–2.94) | 18.55 (18.32–19.46) | 3.58 (3.42–3.69) | 4.17 (4.08–4.25) | 25.69 (25.28–26.00) | 0 | 28 (28–30) | 11.70 (11.56–12.30) | 1477 (1181–1529) | 903 (890–903) | 296 | 27 | 899 | 4540 (4501–4714) |
| windowedHeld | cold | 3 | 35.99 (35.23–36.04) | 11.50 (11.28–11.65) | 20.58 (19.56–20.68) | 4.04 (3.77–4.15) | 15.91 (15.74–16.39) | 39.10 (38.17–39.26) | 675 (656–680) | 53 (51–55) | 15.38 (14.94–15.99) | 2414 (2374–2426) | 1664 (1649–1704) | 296 | 27 | 899 | 5444 (5407–5444) |
| buffered | cold | 3 | 28.58 (27.27–28.97) | 9.16 (9.00–9.48) | 16.60 (15.43–16.81) | 2.52 (2.42–2.62) | 11.94 (11.59–12.01) | 31.60 (30.84–32.38) | 2167 (2167–2178) | 43 (41–44) | 15.76 (14.81–16.02) | 1243 (1241–1246) | 1241 (1241–1241) | 1093 | 27 | 922 | 6402 (6399–6411) |
| heldBuffer | cold | 3 | 31.09 (30.28–31.73) | 10.74 (10.73–10.92) | 16.05 (15.54–16.11) | 4.02 (3.71–4.06) | 14.79 (14.50–15.01) | 34.21 (33.33–35.42) | 2534 (2529–2652) | 43 (42–43) | 14.19 (13.76–14.41) | 1390 (1389–1390) | 1241 (1239–1244) | 1093 | 27 | 922 | 6408 (5289–6418) |
| heldBuffer | artifact hit | 3 | 2.88 (2.85–3.11) | — | — | 3.19 (3.16–3.42) | — | 3.15 (3.13–3.39) | — | 8 (8–9) | 3.58 (3.57–3.76) | — | — | — | — | — | 2912 (2836–4795) |
| heldBuffer | sidecar reopen | 3 | 23.06 (22.58–25.43) | 3.04 (2.97–3.20) | 18.25 (17.71–20.20) | 4.61 (4.54–4.98) | 5.29 (5.19–5.64) | 26.25 (25.95–28.43) | 0 | 27 (25–31) | 10.35 (10.15–12.48) | 2543 (2471–2651) | 1644 (1644–1828) | 296 | 27 | 899 | 6435 (5262–6453) |


## Small models (n = 5)

Models: `duplex` (IFC, 2.3 MiB), `Right_Hand` (STEP, 3.6 MiB), `gearbox`
(STEP, 6.2 MiB), `SEESTRASSE` and `FM_ARC_DigitalHub` (IFC, 13.6 and 13.7
MiB), `MB-Khaya` (IFC, 31.4 MiB).

### What the small models show

- **IFC: buffered is faster at every size measured, and the gap grows with
  size.** Cold engine time, buffered against `windowedHandle`: −0.18 s at
  2.3 MiB (−20 %), −0.24 s and −0.67 s at 13.6/13.7 MiB (−13 %, −17 %),
  −2.55 s at 31.4 MiB (−43 %). At n = 5 every one of these has disjoint
  ranges. **There is no IFC size in this set below which windowed is not
  measurably different from buffered;** at 2.3 MiB the difference is
  0.18 s and real, but small against the ~1 s load.
- **Where the IFC gap is:** Parse and, from ~14 MiB, Geometry. On MB-Khaya,
  Geometry is 4.70 s windowed against 2.44 s buffered and Parse 0.71 against
  0.46 s. On duplex, it is Parse alone (0.21 s against 0.09 s).
- **STEP: no measurable difference at these sizes.** `Right_Hand`: every arm
  within 1.79–1.97 s with overlapping ranges. `gearbox`: `windowedHandle`'s
  median is 1.55 s against 1.36–1.43 s for the rest, but its range
  (1.32–1.59) overlaps all of them; read it as noise at n = 5.
- **The held-buffer prototype tracks buffered**, a little behind it (IFC
  +0.06 to +0.16 s; its source hash and sidecar export are the
  difference), and keeps the sidecar. `windowedHeld` tracks `windowedHandle`
  within noise on every small model.
- **`noSidecar` (no source hash) is not measurably cheaper** than
  `windowedHandle` on the small models (−1 % to −9 %, overlapping ranges
  except duplex, −0.07 s). The hash is not where small-model time goes.
- **First pixels:** the first mesh lands 0.5–1.3 s after open in every arm;
  buffered is earliest on IFC by 0–0.3 s (MB-Khaya 0.99 s against 1.31 s),
  the same within noise on STEP. **Previews before the index** only appear
  where the windowed parse is slow enough for the preview stream to get
  ahead: duplex 71 meshes windowed and 0 buffered (buffered's index lands
  first, at 0.53 s), SEESTRASSE ~115 in every arm, none on STEP or MB-Khaya.
  At these sizes the index lands within 0.5–1.5 s of open in every arm, so
  "previews before index" doesn't separate the arms.
- **Long tasks before ready** are 9–18, the same across arms within ±1 for
  STEP and within 3–4 for IFC (fewer for buffered on MB-Khaya: 14 against
  18, matching its shorter load).
- **Worker memory:** the peak backing store is higher for the windowed arms
  (the window), highest for `windowedHeld` (window plus the held file:
  MB-Khaya 120 MiB against 82 windowed-handle and 71 buffered). **After the
  spill, every arm reads the same backing store** (12 MiB duplex, 26
  SEESTRASSE, 59 MB-Khaya), and every buffered and held arm logged its spill
  (`released resident source buffer (…B)`, or for `windowedHeld` `released
  the Blob store's whole-file copy`). At these sizes the buffered arms are
  **not** seen retaining the source after spill. The after-spill excess
  was measured on PSB, 1,150 MB against 314, with a conway retainer present
  then and a Share-side retainer pinning the same buffer (see
  [the retainer subsection](#why-the-buffered-arms-still-retain-the-source) of the "After conway 1.1645.781" section), so it cannot be attributed to conway alone; see the
  large-model section for whether it shows here.
- **Renderer peak RSS** is lower for buffered on the larger IFCs
  (MB-Khaya 821 MiB against 1,059), the same elsewhere.

### Reopen paths

- **Artifact hit:** 0.08–0.26 s engine time, ready 0.16–0.43 s after open,
  for both reopen arms; it doesn't depend on the arm that wrote it.
- **Sidecar reopen** cuts Parse to 0.04–0.17 s and lands the index sooner
  (MB-Khaya 0.79 s against 1.48 s cold windowed), but Geometry still runs
  windowed, so on the IFCs where buffered wins it is **slower than a cold
  buffered load**: MB-Khaya 5.05 s (`windowedHandle`) and 5.50 s
  (`heldBuffer`) against 3.39 s cold buffered. On duplex, gearbox and
  Right_Hand it is 0.1–0.3 s faster than the same arm's cold load.
- **A `heldBuffer` sidecar reopen opens windowed over the held Blob store**
  (`windowed=yes`, `Blob store (disabled; whole file held, …)`), not
  buffered: the sidecar path is windowed whatever the cold open was.
- **Arm-4 sidecar verdict, small models:** every `heldBuffer` sidecar reopen
  (32 of 32, all six models) opened from the index (`Engine index: from
  sidecar (… MB), no parse`), and its tree (node count and hash over every
  node's id, name and child count) and one property read of the middle
  leaf matched the cold load's. The same holds for every `windowedHandle`
  sidecar reopen.


## Medium models (n = 3)

Models: `Arty_Z7` (STEP, 55.5 MiB), `DSA2` (STEP, 105.7 MiB), `sp-231MB`
(IFC, 231.4 MiB), `D3D` (IFC, 213.6 MiB, conway's known window-thrashing
model). No trial was contended or failed; every record passed its arm check.

### What the medium models show

- **IFC: buffered stays 21–24 % faster.** `sp-231MB` 15.41 s against 20.38 s
  (−4.97 s), `D3D` 43.70 s against 55.27 s (−11.6 s), ranges disjoint. As on
  the small IFCs, the gap is Parse (3.0 against 4.5 s; 4.0 against 5.4 s) and
  Geometry (11.0 against 14.2 s; 38.3 against 48.3 s).
- **STEP: the gap opens between 56 and 106 MiB.** `Arty_Z7` (55.5 MiB):
  13.63 s buffered against 14.12 s, −3 %, ranges touching (13.57–13.86
  against 14.04–14.51): at most half a second, at the edge of the noise.
  `DSA2` (105.7 MiB): 6.77 s against 8.26 s, −18 %, disjoint. Two STEP
  models are not a curve; read this as "STEP's windowed overhead is small
  until somewhere in 56–106 MiB", not as a threshold.
- **`heldBuffer` costs 0.1–1.3 s over buffered** (`DSA2` +0.58 s, `sp-231MB`
  +1.31 s, `D3D` −0.31 s within noise), most of it in Parse (the source
  hash), and still beats windowed by 11–22 %.
- **`windowedHeld` against `windowedHandle`:** within noise on all four
  (−3 % to +3 %). In headless Chromium with the file in the page cache, the
  Blob store holding the file costs no time against the sync handle at
  these sizes; it costs memory (below).
- **`noSidecar`** (no source hash): within noise of `windowedHandle` except
  `DSA2` (−4 %, overlapping).
- **First pixels:** the first mesh lands 1.0–3.0 s after open in every arm;
  buffered is earliest (`sp-231MB` 1.03 s against 1.24; `D3D` 0.96 s against
  1.28; `DSA2` 2.54 against 3.00). **Previews before the index:** the
  windowed IFC arms show ~1,100–1,900 preview meshes when the index lands,
  buffered 2,185 (`sp-231MB`) and 4,681 (`D3D`), `heldBuffer` 2,527 and
  4,681; the buffered index also lands sooner (`D3D` 7.6 s against 9.7 s),
  so buffered draws more before the index in less time. STEP shows no
  preview meshes before the index on any arm.
- **Long tasks before ready** follow the load's length: `D3D` 33 buffered
  against 39 windowed (27 s against 32 s total); `sp-231MB` 8.6 s against
  9.8 s.
- **Worker memory.** Peak backing store (un-GC'd polls, an upper bound):
  windowed arms far above buffered on the large IFC, `sp-231MB` 926 MiB
  (`windowedHandle`) and 1,297 (`windowedHeld`) against 377 buffered,
  417 `heldBuffer`; on `D3D` 565 / 790 against 657 / 658; on `DSA2`
  371 / 523 against 205 / 275. The windowed peaks include dead window
  copies a GC would collect; the GC'd reading at the index is lower but
  shows the same order (`sp-231MB` 594 / 996 against 309 / 308).
- **After the spill (GC'd), buffered IFC arms retain more than windowed:**
  `sp-231MB` 321 MiB for `buffered` and `heldBuffer` against 153 for every
  windowed arm (+168 MiB, 0.73 of the file); `D3D` 371 against 355
  (+16 MiB). Both buffered arms logged `released resident source buffer
  (…B)`. **A conway retainer was present at this point** (Share#2139
  step 1: demand state keeps subarrays of the source alive past the spill),
  and the later section shows a second, Share-side retainer pinning the same
  buffer (see [the retainer subsection](#why-the-buffered-arms-still-retain-the-source) of the "After conway 1.1645.781" section), so this excess cannot be attributed to conway
  alone; that `D3D` retains far less than `sp-231MB` says the retained share
  depends on the model. On STEP,
  all arms read the same after spill (`Arty_Z7` 120, `DSA2` 199).
- **wasm and renderer:** `engineWasmMb` is the same in every arm of a
  model (`D3D` and `sp-231MB` 611/515, `Arty_Z7` 515, `DSA2` 83). Renderer
  peak RSS is 1.6–5.1 GB and doesn't order the arms consistently.

### Reopen paths

- **Artifact hit:** 0.17 s (`DSA2`) to 2.9 s (`D3D`) engine time; ready
  0.4–5.1 s after open. The same for both reopen arms.
- **Sidecar reopen:** Parse drops to 0.26–1.85 s and the index lands
  sooner (`D3D` 5.6 s against 9.7 s cold), but **Geometry still pages
  windowed, so the reopen is not faster than a cold buffered load**: `D3D`
  52.5 s against 43.7 s cold buffered; `sp-231MB` 17.3 s against 15.4 s;
  `DSA2` 5.97 s against 6.77 s (faster here); `Arty_Z7` 13.3 s against
  13.6 s.
- **A sidecar reopen draws nothing before its index.** Prev@idx is 0 on
  every sidecar reopen, and on the large IFCs the first mesh comes *after*
  the index: `D3D` 5.89 s against 1.28 s on its cold load, `sp-231MB` 2.17 s
  against 1.24 s. A cold windowed or buffered load shows first pixels
  sooner than the sidecar reopen of the same file. (Whether the reopen
  skips the preview stream by design is not something these records say.)
- **Arm-4 sidecar verdict, medium models:** every `heldBuffer` sidecar
  reopen (12 of 12) opened from the index (`Engine index: from sidecar
  (… MB), no parse`), windowed over the held Blob store, and its tree and
  property read matched the cold load's. Caveat for `DSA2`: its tree is a
  single node, so its signature is weak (the property read of that node
  matched).


## Large models (n = 2)

Models: `BLSN_007` (STEP, 268.6 MiB), `DOWA` (IFC, 398.4 MiB), `PSB` (IFC,
860.7 MiB). Nothing was cut: every large model planned ran at n = 2.

`PSB` (IFC, 860.7 MiB) is the model every earlier number is on.
**Reproduction check:** the cold medians reproduce Share#2139's table
within a second: `windowedHandle` 36.45 s (36.5 there), `windowedHeld`
37.62 (38.9), `buffered` 30.24 (31.2), `heldBuffer` 32.26 (33.7).

### What PSB shows

- **Buffered is 17 % faster** (30.24 s against 36.45, −6.2 s); `heldBuffer`
  11 % (−4.2 s). **`noSidecar` is 9 % faster** (33.26 s, −3.2 s): on PSB the
  source hash is a real cost, unlike on every smaller model. `heldBuffer`
  pays the same hash and lands 2.0 s behind buffered.
- **First pixels:** first mesh at 2.63 s buffered, 3.19 `noSidecar`, 3.49
  `windowedHandle`, 4.27 `heldBuffer`, 4.32 `windowedHeld`. The two arms that
  hold the file and hash it before the open start drawing ~1.6 s after
  buffered.
- **Previews before the index:** 2,173 meshes buffered and 2,301
  `heldBuffer` against 669 `windowedHandle`, 641 `windowedHeld`, 613
  `noSidecar`, with the buffered index at 12.3 s against 15.9 s. These are
  scene meshes, not conway's units, but they line up with Share#2092's
  ~2,165 against ~640 units.
- **Worker memory after the spill (GC'd, ~16–17 s after Total): 1,096 MiB
  for `buffered` and `heldBuffer` against 300 MiB for every windowed arm.**
  Both buffered arms logged `released resident source buffer
  (902472037B)`, yet ~796 MiB more stays live. A conway retainer was present at this
  point (Share#2139 step 1) and the later section shows a second, Share-side
  retainer pinning the same buffer (see [the retainer subsection](#why-the-buffered-arms-still-retain-the-source) of the "After conway 1.1645.781" section), so this excess **cannot be
  attributed to conway alone**; it was observed, with that conway retainer
  still in place. At Total+3 s
  (GC'd) the windowed-held arm still holds its copy (1,157 MiB) and frees it
  at its spill (300).
- **Peak backing store** (un-GC'd polls): `windowedHeld` 2,326 MiB,
  `heldBuffer` 1,389, `noSidecar` 1,397, `buffered` 1,243,
  `windowedHandle` 1,083. **Renderer peak RSS:** 6.4 GB for both buffered
  arms against 4.6 GB `windowedHandle` and 5.5 GB `windowedHeld`.
- **Long tasks before ready:** 42–45 buffered against 51–60 windowed;
  total long-task time 13.6–16.8 s on every arm, `heldBuffer` lowest.

### PSB reopen paths

- **Artifact hit:** 3.2 s engine, ready 3.5 s.
- **Sidecar reopen: 23.49 s (`windowedHandle`) and 25.82 s (`heldBuffer`),
  faster than any cold arm** (−36 % and −29 % against the same arm's cold
  load, −22 % and −15 % against cold buffered). Parse drops from ~12 s to
  ~3 s and the index lands at 4.4 / 5.8 s against 15.9 s; first mesh
  3.75 / 5.10 s, about the cold load's, with no preview meshes before the
  index (the first mesh comes just before it).
- **Arm-4 sidecar verdict, PSB:** both `heldBuffer` sidecar reopens opened
  from the index (`Engine index: from sidecar (143.8 MB), no parse`),
  windowed over the held Blob store (`Blob store (disabled; whole file held,
  1006 reads from memory), 1 reads, 860.7 MB`), and matched the cold load's
  tree and property read.

### What DOWA (IFC, 398.4 MiB) shows

- **Buffered 22 % faster** (21.21 s against 27.08, −5.9 s; ranges
  disjoint); `heldBuffer` −10 %, `noSidecar` −9 %, `windowedHeld` −5 %
  (ranges 25.28–25.96 against 26.14–28.01, touching at n = 2).
- **First mesh** 5.9 s buffered, 6.3 `heldBuffer`, 7.2 `noSidecar`, 8.0
  `windowedHandle`, 8.8 `windowedHeld`. DOWA's first mesh is late on every
  arm (5–9 s); previews before the index vary 0–1,502 between rounds of
  the same arm, so on this model that count is not an arm signal at n = 2.
- **After the spill: 530 MiB buffered and `heldBuffer` against 387 for every
  windowed arm** (+143 MiB), the same retention pattern as `sp-231MB` and
  PSB.
- **Sidecar reopen:** 23.72 s `windowedHandle` (−12 % against its cold
  load) and 20.70 s `heldBuffer`, about cold buffered (21.21). Index at
  3.4–4.1 s against 9.9 cold; first mesh 2.6–3.2 s, **sooner** than any cold
  arm on this model. Both `heldBuffer` sidecar reopens matched the cold
  tree (43,932 nodes) and property read.

### What BLSN_007 (STEP, 268.6 MiB) shows

- **Buffered 10 % faster** (20.98 s against 23.33, −2.35 s, disjoint at
  n = 2); `heldBuffer` −5 %; `windowedHeld` and `noSidecar` within noise.
  The gap is Parse (2.84 against 3.55 s) and Geometry (16.95 against 18.51).
- **No preview meshes before the index** on any arm (as on every STEP
  model); the index lands at 4.1–5.1 s and the first mesh just after it.
  Buffered is first on both (4.13 / 4.14 s against 5.05 / 4.81).
- **After the spill: 419 MiB buffered and `heldBuffer` against 211 for every
  windowed arm** (+208 MiB). **The source retention is not IFC-only:** the
  first STEP model where it shows (`Arty_Z7` and `DSA2` read the same on
  every arm).
- **Sidecar reopen:** 19.96 s / 19.69 s, −14 % against the cold
  `windowedHandle` and ~1.3 s faster than cold buffered; index at 1.4–1.8 s.
  Both `heldBuffer` sidecar reopens matched the cold tree (2,269 nodes) and
  property read.


## Tables

### Small models

#### SEESTRASSE (IFC, 13.6 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 6 +2c | 1.89 (1.82–2.07) | 0.37 (0.33–0.41) | 1.02 (0.98–1.10) | 0.63 (0.59–0.75) | 0.85 (0.82–0.97) | 2.43 (2.30–2.56) | 115 | 12 (10–12) | 2.47 (2.19–2.54) | 63 (45–63) | 27 (27–28) | 26 | 16 | 69 | 774 (740–791) |
| windowedHandle | artifact hit | 6 +2c | 0.24 (0.21–0.30) | — | — | 0.42 (0.37–0.45) | — | 0.39 (0.34–0.42) | — | 7 (6–8) | 0.98 (0.94–1.05) | — | — | — | — | — | 674 (628–678) |
| windowedHandle | sidecar reopen | 6 +2c | 1.95 (1.75–2.07) | 0.12 (0.11–0.14) | 1.30 (1.18–1.46) | 0.59 (0.51–0.63) | 0.74 (0.65–0.80) | 2.45 (2.17–2.57) | 0 | 10 (9–12) | 1.76 (1.63–2.00) | 36 (30–36) | 29 (28–30) | 26 | 16 (16–16) | 69 | 767 (701–792) |
| windowedHeld | cold | 5 +1c | 1.96 (1.72–2.15) | 0.37 (0.31–0.44) | 1.02 (0.93–1.16) | 0.70 (0.45–0.82) | 0.91 (0.72–1.02) | 2.50 (2.25–2.68) | 115 | 12 (10–13) | 2.48 (2.06–2.53) | 63 (57–78) | 41 (40–78) | 26 | 16 | 69 | 789 (787–807) |
| buffered | cold | 5 +1c | 1.64 (1.48–1.80) | 0.29 (0.27–0.34) | 0.86 (0.78–0.92) | 0.53 (0.46–0.60) | 0.76 (0.68–0.88) | 2.15 (1.92–2.32) | 110 (85–115) | 11 (11–13) | 2.35 (2.18–2.48) | 32 (32–32) | 27 (27–27) | 26 | 16 | 69 | 677 (673–757) |
| heldBuffer | cold | 6 | 1.80 (1.65–2.14) | 0.32 (0.30–0.36) | 0.88 (0.83–1.17) | 0.57 (0.47–0.63) | 0.85 (0.75–0.93) | 2.34 (2.09–2.93) | 115 (70–115) | 12 (10–14) | 2.43 (2.13–2.99) | 34 (34–34) | 27 (27–28) | 26 | 16 | 69 | 749 (679–758) |
| heldBuffer | artifact hit | 5 +1c | 0.28 (0.23–0.30) | — | — | 0.45 (0.39–0.52) | — | 0.42 (0.36–0.48) | — | 7 (6–7) | 1.00 (0.90–1.16) | — | — | — | — | — | 681 (677–684) |
| heldBuffer | sidecar reopen | 5 +1c | 1.97 (1.69–2.03) | 0.13 (0.11–0.14) | 1.37 (1.05–1.42) | 0.59 (0.57–0.61) | 0.75 (0.72–0.80) | 2.47 (2.32–2.54) | 0 | 10 (9–11) | 1.86 (1.56–1.92) | 56 (56–57) | 42 (41–57) | 26 | 16 (16–16) | 69 | 790 (780–858) |
| noSidecar | cold | 5 | 1.98 (1.76–2.09) | 0.37 (0.34–0.42) | 1.05 (0.89–1.11) | 0.68 (0.54–0.73) | 0.89 (0.81–0.96) | 2.52 (2.25–2.68) | 115 | 12 (11–13) | 2.53 (2.21–2.67) | 54 (39–63) | 27 (27–28) | 26 | 16 | 69 | 782 (722–784) |

#### duplex (IFC, 2.3 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 5 +3c | 0.91 (0.86–0.92) | 0.21 (0.19–0.21) | 0.23 (0.20–0.28) | 0.52 (0.51–0.56) | 0.69 (0.68–0.73) | 1.21 (1.14–1.21) | 71 (46–81) | 9 (9–11) | 1.60 (1.47–1.73) | 31 (30–43) | 22 (22–38) | 12 | 14 | 19 | 459 (455–464) |
| windowedHandle | artifact hit | 5 +3c | 0.09 (0.08–0.12) | — | — | 0.24 (0.19–0.25) | — | 0.21 (0.17–0.22) | — | 5 (4–6) | 0.71 (0.61–0.83) | — | — | — | — | — | 447 (444–448) |
| windowedHandle | sidecar reopen | 5 +3c | 0.80 (0.76–0.87) | 0.04 (0.04–0.05) | 0.32 (0.28–0.34) | 0.47 (0.46–0.51) | 0.61 (0.59–0.69) | 1.03 (1.00–1.09) | 0 | 9 (8–10) | 1.11 (1.04–1.17) | 18 | 13 (13–15) | 12 | 14 | 19 | 598 (594–600) |
| windowedHeld | cold | 5 | 0.92 (0.88–0.96) | 0.21 (0.20–0.23) | 0.24 (0.20–0.29) | 0.53 (0.51–0.57) | 0.70 (0.68–0.73) | 1.20 (1.16–1.24) | 89 (13–127) | 10 (9–11) | 1.61 (1.56–1.75) | 40 (40–40) | 40 | 12 | 14 (14–14) | 19 | 456 (453–458) |
| buffered | cold | 5 | 0.73 (0.73–0.77) | 0.09 (0.08–0.10) | 0.30 (0.20–0.32) | 0.52 (0.45–0.57) | 0.53 (0.48–0.62) | 1.00 (0.97–1.02) | 0 | 10 (9–11) | 1.59 (1.54–1.69) | 18 | 15 (15–15) | 12 | 13 (13–14) | 19 | 457 (455–459) |
| heldBuffer | cold | 5 | 0.80 (0.76–0.84) | 0.10 (0.09–0.12) | 0.24 (0.21–0.33) | 0.54 (0.49–0.56) | 0.69 (0.51–0.71) | 1.06 (0.99–1.10) | 0 | 9 (9–11) | 1.64 (1.50–1.70) | 20 | 14 | 12 | 14 | 19 | 458 (455–458) |
| heldBuffer | artifact hit | 5 | 0.09 (0.07–0.11) | — | — | 0.22 (0.18–0.24) | — | 0.19 (0.16–0.21) | — | 5 (4–6) | 0.72 (0.64–0.82) | — | — | — | — | — | 445 (440–447) |
| heldBuffer | sidecar reopen | 5 | 0.80 (0.77–0.85) | 0.04 (0.04–0.05) | 0.31 (0.29–0.32) | 0.49 (0.44–0.53) | 0.64 (0.50–0.73) | 1.01 (0.96–1.07) | 0 | 9 (8–10) | 1.02 (0.98–1.07) | 21 | 15 (15–15) | 12 | 14 | 19 | 590 (536–597) |
| noSidecar | cold | 5 | 0.84 (0.82–0.94) | 0.20 (0.19–0.21) | 0.21 (0.20–0.23) | 0.48 (0.46–0.56) | 0.67 (0.63–0.74) | 1.12 (1.10–1.24) | 58 (26–127) | 10 (9–11) | 1.61 (1.55–1.73) | 25 (20–42) | 20 (20–36) | 12 | 14 | 19 | 457 (456–464) |

#### gearbox (STEP, 6.2 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 5 | 1.55 (1.32–1.59) | 0.16 (0.14–0.17) | 0.96 (0.74–1.01) | 0.59 (0.52–0.65) | 0.77 (0.73–0.83) | 1.77 (1.53–1.77) | 0 | 10 (9–11) | 1.59 (1.52–1.65) | 22 (21–23) | 17 (17–18) | 18 | 34 (34–34) | 48 | 562 (559–568) |
| windowedHandle | artifact hit | 5 | 0.08 (0.07–0.09) | — | — | 0.19 (0.18–0.22) | — | 0.16 (0.15–0.19) | — | 4 (4–5) | 0.68 (0.62–0.76) | — | — | — | — | — | 477 (474–482) |
| windowedHandle | sidecar reopen | 5 | 1.24 (1.20–1.43) | 0.05 (0.04–0.07) | 0.80 (0.76–0.91) | 0.47 (0.46–0.53) | 0.63 (0.62–0.68) | 1.41 (1.36–1.61) | 0 | 8 (7–10) | 0.91 (0.85–1.15) | 19 (19–24) | 17 (17–18) | 18 | 34 | 48 | 639 (622–693) |
| windowedHeld | cold | 5 | 1.43 (1.35–1.53) | 0.16 (0.14–0.16) | 0.79 (0.76–0.89) | 0.62 (0.57–0.64) | 0.79 (0.75–0.88) | 1.61 (1.54–1.71) | 0 | 10 (9–11) | 1.56 (1.48–1.74) | 28 | 23 (23–23) | 18 | 34 (34–34) | 48 | 563 (554–566) |
| buffered | cold | 5 | 1.36 (1.27–1.41) | 0.14 (0.12–0.15) | 0.82 (0.77–0.85) | 0.60 (0.55–0.61) | 0.79 (0.71–0.86) | 1.56 (1.47–1.62) | 0 | 10 (10–11) | 1.60 (1.50–1.65) | 19 (19–19) | 17 (17–18) | 18 | 34 | 48 | 535 (530–536) |
| heldBuffer | cold | 5 | 1.42 (1.39–1.48) | 0.15 (0.14–0.16) | 0.79 (0.78–0.84) | 0.64 (0.57–0.65) | 0.81 (0.74–0.84) | 1.65 (1.56–1.71) | 0 | 10 (10–11) | 1.57 (1.51–1.64) | 21 (21–22) | 17 (17–18) | 18 | 34 | 48 | 536 (530–540) |
| heldBuffer | artifact hit | 5 | 0.08 (0.07–0.13) | — | — | 0.22 (0.18–0.25) | — | 0.19 (0.15–0.22) | — | 5 (5–6) | 0.72 (0.69–0.77) | — | — | — | — | — | 472 (469–477) |
| heldBuffer | sidecar reopen | 5 | 1.28 (1.20–1.42) | 0.06 (0.05–0.08) | 0.79 (0.74–0.91) | 0.51 (0.48–0.55) | 0.67 (0.66–0.74) | 1.45 (1.35–1.60) | 0 | 9 (8–12) | 1.05 (0.84–1.15) | 25 (25–34) | 25 (24–25) | 18 | 34 | 48 | 655 (621–708) |
| noSidecar | cold | 5 | 1.41 (1.34–1.48) | 0.16 (0.14–0.17) | 0.83 (0.78–0.86) | 0.59 (0.55–0.66) | 0.82 (0.71–0.83) | 1.62 (1.54–1.69) | 0 | 10 (10–11) | 1.61 (1.54–1.72) | 19 (19–29) | 18 (17–18) | 18 | 34 | 48 | 556 (550–561) |

#### Right_Hand (STEP, 3.6 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 5 +2c | 1.93 (1.86–1.99) | 0.14 (0.13–0.15) | 1.33 (1.28–1.40) | 0.66 (0.57–0.80) | 0.83 (0.77–0.99) | 2.30 (2.22–2.39) | 0 | 12 (11–12) | 1.93 (1.87–1.97) | 22 (17–22) | 14 (14–15) | 15 | 27 | 83 | 518 (502–582) |
| windowedHandle | artifact hit | 6 +1c | 0.10 (0.09–0.11) | — | — | 0.25 (0.23–0.26) | — | 0.22 (0.20–0.23) | — | 5 (4–5) | 0.69 (0.67–0.74) | — | — | — | — | — | 503 (500–545) |
| windowedHandle | sidecar reopen | 5 +2c | 1.83 (1.75–1.91) | 0.07 (0.07–0.07) | 1.30 (1.25–1.40) | 0.54 (0.48–0.61) | 0.70 (0.64–0.79) | 2.17 (2.04–2.29) | 0 | 10 (8–12) | 1.28 (1.12–1.56) | 18 (18–21) | 15 (15–19) | 15 | 26 (26–26) | 83 | 647 (587–707) |
| windowedHeld | cold | 5 | 1.97 (1.89–2.00) | 0.15 (0.14–0.18) | 1.37 (1.30–1.42) | 0.62 (0.60–0.79) | 0.80 (0.78–0.97) | 2.35 (2.22–2.38) | 0 | 11 (10–12) | 1.97 (1.82–2.07) | 20 (20–23) | 18 (17–18) | 15 | 27 | 83 | 597 (566–618) |
| buffered | cold | 5 | 1.88 (1.84–1.95) | 0.14 (0.13–0.16) | 1.34 (1.27–1.42) | 0.60 (0.57–0.67) | 0.78 (0.76–0.85) | 2.26 (2.18–2.34) | 0 | 11 (10–12) | 1.94 (1.72–2.02) | 15 | 14 (14–15) | 15 | 26 | 83 | 543 (506–587) |
| heldBuffer | cold | 5 | 1.88 (1.84–1.98) | 0.14 (0.13–0.15) | 1.34 (1.33–1.38) | 0.59 (0.54–0.69) | 0.78 (0.74–0.86) | 2.24 (2.20–2.36) | 0 | 11 | 1.89 (1.83–1.94) | 17 | 14 (13–15) | 15 | 26 | 83 | 548 (500–587) |
| heldBuffer | artifact hit | 5 | 0.12 (0.11–0.13) | — | — | 0.28 (0.27–0.28) | — | 0.25 (0.24–0.25) | — | 5 (4–5) | 0.73 (0.69–0.77) | — | — | — | — | — | 504 (499–543) |
| heldBuffer | sidecar reopen | 5 | 1.84 (1.80–1.87) | 0.07 (0.06–0.07) | 1.32 (1.31–1.35) | 0.53 (0.49–0.66) | 0.67 (0.64–0.82) | 2.19 (2.13–2.21) | 0 | 10 (8–11) | 1.28 (1.20–1.32) | 19 (19–25) | 18 (18–18) | 15 | 26 | 83 | 648 (605–676) |
| noSidecar | cold | 5 | 1.79 (1.73–1.88) | 0.13 (0.12–0.14) | 1.28 (1.22–1.31) | 0.66 (0.61–0.70) | 0.84 (0.80–0.90) | 2.15 (2.05–2.25) | 0 | 11 (10–11) | 1.83 (1.75–1.92) | 23 (18–23) | 14 (13–15) | 15 | 26 | 83 | 583 (558–620) |

#### FM_ARC_DigitalHub (IFC, 13.7 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 5 | 3.93 (3.76–4.12) | 0.32 (0.30–0.44) | 3.17 (2.97–3.28) | 0.53 (0.47–0.70) | 0.85 (0.75–0.90) | 4.33 (4.15–4.60) | 1 (1–106) | 14 (13–16) | 2.90 (2.44–2.99) | 62 (49–68) | 30 (29–34) | 31 | 18 | 120 | 836 (825–857) |
| windowedHandle | artifact hit | 5 | 0.22 (0.18–0.26) | — | — | 0.41 (0.35–0.44) | — | 0.38 (0.32–0.41) | — | 6 | 0.89 (0.85–0.91) | — | — | — | — | — | 645 (634–690) |
| windowedHandle | sidecar reopen | 5 | 3.59 (3.56–3.64) | 0.11 (0.09–0.12) | 3.07 (2.99–3.08) | 0.50 (0.44–0.58) | 0.63 (0.54–0.66) | 4.02 (3.97–4.12) | 0 | 12 (10–12) | 1.98 (1.81–2.14) | 51 (49–59) | 34 (33–35) | 31 | 18 (18–18) | 120 | 869 (858–905) |
| windowedHeld | cold | 5 | 3.96 (3.83–4.14) | 0.33 (0.29–0.41) | 3.07 (2.87–3.32) | 0.57 (0.49–0.59) | 0.85 (0.80–0.91) | 4.36 (4.20–4.59) | 1 (1–106) | 15 (14–16) | 2.81 (2.71–2.86) | 82 (63–99) | 48 (43–82) | 31 | 18 | 120 | 842 (825–908) |
| buffered | cold | 4 +5c | 3.26 (3.10–3.43) | 0.26 (0.24–0.27) | 2.55 (2.50–2.68) | 0.48 (0.36–0.53) | 0.68 (0.58–0.73) | 3.76 (3.60–3.95) | 1 | 14 (12–14) | 2.50 (2.32–2.65) | 56 (43–56) | 35 (34–35) | 31 | 18 | 120 | 862 (840–871) |
| heldBuffer | cold | 5 +1c | 3.32 (3.25–3.57) | 0.27 (0.25–0.29) | 2.54 (2.44–2.67) | 0.51 (0.49–0.61) | 0.76 (0.73–0.86) | 3.79 (3.74–4.08) | 1 | 14 (12–15) | 2.44 (2.34–2.68) | 48 (46–60) | 35 (34–35) | 31 | 18 | 120 | 845 (708–875) |
| heldBuffer | artifact hit | 6 | 0.22 (0.17–0.30) | — | — | 0.40 (0.33–0.47) | — | 0.37 (0.30–0.45) | — | 6 (5–7) | 0.92 (0.86–1.00) | — | — | — | — | — | 678 (654–703) |
| heldBuffer | sidecar reopen | 6 | 3.69 (3.56–3.88) | 0.11 (0.10–0.11) | 3.12 (3.03–3.31) | 0.55 (0.49–0.59) | 0.70 (0.63–0.76) | 4.17 (3.98–4.31) | 0 | 13 (11–14) | 2.09 (1.86–2.21) | 66 (63–73) | 47 (43–63) | 31 | 18 (18–18) | 120 | 865 (775–941) |
| noSidecar | cold | 5 | 3.80 (3.75–3.93) | 0.28 (0.28–0.43) | 3.04 (2.92–3.10) | 0.54 (0.49–0.62) | 0.81 (0.72–0.86) | 4.25 (4.19–4.53) | 1 (1–106) | 14 (14–15) | 2.65 (2.55–2.96) | 69 (48–85) | 69 (29–69) | 31 | 18 (18–18) | 120 | 857 (710–897) |

#### MB-Khaya (IFC, 31.4 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 5 +1c | 5.94 (5.76–6.14) | 0.71 (0.67–0.77) | 4.70 (4.47–4.78) | 1.31 (1.24–1.39) | 1.48 (1.41–1.55) | 6.41 (6.20–6.71) | 0 | 18 (16–19) | 3.21 (3.09–3.48) | 82 (82–89) | 62 (52–62) | 59 | 17 (17–17) | 100 | 1059 (970–1087) |
| windowedHandle | artifact hit | 5 +1c | 0.20 (0.17–0.21) | — | — | 0.39 (0.35–0.42) | — | 0.36 (0.33–0.39) | — | 6 (5–7) | 0.94 (0.79–0.95) | — | — | — | — | — | 784 (752–794) |
| windowedHandle | sidecar reopen | 5 +1c | 5.05 (4.76–5.54) | 0.16 (0.14–0.23) | 4.38 (4.15–4.93) | 0.63 (0.60–0.75) | 0.79 (0.77–0.89) | 5.46 (5.22–6.10) | 0 | 14 (13–15) | 2.29 (2.19–2.65) | 84 (69–84) | 52 (51–52) | 59 | 17 (17–17) | 100 | 1076 (1047–1111) |
| windowedHeld | cold | 5 | 5.93 (5.64–6.20) | 0.69 (0.66–0.71) | 4.71 (4.40–4.95) | 1.28 (1.23–1.45) | 1.41 (1.39–1.48) | 6.39 (6.11–6.70) | 0 | 17 (16–19) | 3.03 (2.87–3.33) | 120 (113–120) | 93 (84–94) | 59 | 17 | 100 | 1117 (1080–1143) |
| buffered | cold | 5 | 3.39 (3.25–3.49) | 0.46 (0.42–0.54) | 2.44 (2.25–2.55) | 0.99 (0.86–1.00) | 1.15 (1.05–1.18) | 3.82 (3.72–4.02) | 0 (0–1) | 14 (13–15) | 2.51 (2.49–2.65) | 71 (69–74) | 57 (56–66) | 59 | 17 | 100 | 821 (812–996) |
| heldBuffer | cold | 5 | 3.52 (3.41–3.58) | 0.50 (0.47–0.50) | 2.46 (2.33–2.48) | 1.14 (1.11–1.17) | 1.31 (1.13–1.34) | 4.05 (3.90–4.14) | 0 | 14 (14–15) | 2.49 (2.44–2.59) | 82 (82–83) | 57 (56–58) | 59 | 17 (17–17) | 100 | 999 (844–1009) |
| heldBuffer | artifact hit | 5 | 0.26 (0.18–0.27) | — | — | 0.46 (0.35–0.49) | — | 0.43 (0.33–0.47) | — | 7 (5–9) | 1.01 (0.81–1.09) | — | — | — | — | — | 787 (751–795) |
| heldBuffer | sidecar reopen | 5 | 5.50 (4.90–5.60) | 0.17 (0.14–0.20) | 4.79 (4.33–4.96) | 0.75 (0.64–0.79) | 0.90 (0.78–0.95) | 6.05 (5.36–6.12) | 0 | 14 (13–14) | 2.51 (2.16–2.65) | 100 (100–103) | 83 (83–100) | 59 | 17 (17–17) | 100 | 1061 (946–1102) |
| noSidecar | cold | 5 | 5.87 (5.78–6.33) | 0.67 (0.65–0.69) | 4.66 (4.60–5.01) | 1.27 (1.19–1.32) | 1.43 (1.35–1.51) | 6.35 (6.24–6.87) | 0 | 17 (17–18) | 3.22 (3.14–3.38) | 77 (70–86) | 62 (52–62) | 59 | 17 (17–17) | 100 | 1069 (1035–1073) |

#### Cold engine time, median, relative to windowedHandle

| Model | MiB | windowedHandle | windowedHeld | buffered | heldBuffer | noSidecar |
|---|---|---|---|---|---|---|
| SEESTRASSE (ifc) | 13.6 | 1.89 s | 1.96 s (+3 %) | 1.64 s (-13 %) | 1.80 s (-5 %) | 1.98 s (+5 %) |
| duplex (ifc) | 2.3 | 0.91 s | 0.92 s (+1 %) | 0.73 s (-20 %) | 0.80 s (-12 %) | 0.84 s (-8 %) |
| gearbox (step) | 6.2 | 1.55 s | 1.43 s (-8 %) | 1.36 s (-12 %) | 1.42 s (-8 %) | 1.41 s (-9 %) |
| Right_Hand (step) | 3.6 | 1.93 s | 1.97 s (+2 %) | 1.88 s (-3 %) | 1.88 s (-2 %) | 1.79 s (-7 %) |
| FM_ARC_DigitalHub (ifc) | 13.7 | 3.93 s | 3.96 s (+1 %) | 3.26 s (-17 %) | 3.32 s (-16 %) | 3.80 s (-3 %) |
| MB-Khaya (ifc) | 31.4 | 5.94 s | 5.93 s (0 %) | 3.39 s (-43 %) | 3.52 s (-41 %) | 5.87 s (-1 %) |

### Medium models

#### Arty_Z7 (STEP, 55.5 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 3 | 14.12 (14.04–14.51) | 0.98 (0.97–1.02) | 12.46 (12.42–12.80) | 1.75 (1.63–1.77) | 1.95 (1.82–1.99) | 14.79 (14.71–15.18) | 0 | 21 (21–23) | 5.50 (5.49–5.54) | 152 (152–152) | 74 (70–74) | 120 | 230 (230–230) | 515 | 2015 (2008–2061) |
| windowedHandle | artifact hit | 3 | 0.65 (0.63–0.65) | — | — | 0.81 (0.79–0.81) | — | 0.78 (0.76–0.78) | — | 7 (7–8) | 1.34 (1.33–1.36) | — | — | — | — | — | 1519 (1518–1526) |
| windowedHandle | sidecar reopen | 3 | 13.33 (13.31–13.66) | 0.26 (0.24–0.26) | 12.61 (12.59–12.88) | 0.86 (0.82–0.91) | 1.06 (1.01–1.14) | 14.03 (13.88–14.35) | 0 | 18 | 4.79 (4.63–4.94) | 121 (121–121) | 85 (74–86) | 120 | 230 (230–230) | 515 | 1938 (1923–1959) |
| windowedHeld | cold | 3 | 14.04 (13.87–14.51) | 0.92 (0.91–0.97) | 12.45 (12.30–12.84) | 1.72 (1.72–1.84) | 1.92 (1.91–2.06) | 14.78 (14.54–15.20) | 0 | 23 (21–23) | 5.43 (5.36–5.49) | 207 (207–208) | 135 (130–135) | 120 | 230 (230–230) | 515 | 2092 (2090–2104) |
| buffered | cold | 3 | 13.63 (13.57–13.86) | 0.84 (0.79–0.85) | 12.24 (12.16–12.46) | 1.54 (1.52–1.57) | 1.74 (1.73–1.76) | 14.36 (14.28–14.54) | 0 | 22 (21–22) | 5.55 (5.55–5.73) | 121 (121–121) | 92 (92–94) | 120 | 230 | 515 | 1960 (1577–1980) |
| heldBuffer | cold | 3 | 13.74 (13.61–14.32) | 0.92 (0.83–0.98) | 12.16 (12.15–12.62) | 1.71 (1.64–1.83) | 1.93 (1.84–2.04) | 14.39 (14.26–15.05) | 0 | 21 (20–21) | 5.19 (4.97–5.37) | 152 (152–152) | 94 (92–106) | 120 | 230 | 515 | 1969 (1969–1978) |
| heldBuffer | artifact hit | 3 | 0.62 (0.59–0.64) | — | — | 0.77 (0.74–0.81) | — | 0.74 (0.71–0.78) | — | 5 (5–8) | 1.13 (1.12–1.39) | — | — | — | — | — | 1521 (1517–1524) |
| heldBuffer | sidecar reopen | 3 | 13.43 (13.15–13.71) | 0.27 (0.26–0.28) | 12.53 (12.27–12.89) | 1.04 (1.03–1.08) | 1.22 (1.20–1.27) | 14.07 (13.71–14.31) | 0 | 18 (18–19) | 4.52 (4.38–4.74) | 179 (176–179) | 132 (125–145) | 120 | 230 (230–230) | 515 | 1993 (1984–2001) |
| noSidecar | cold | 3 | 14.28 (14.15–14.33) | 0.91 (0.88–0.96) | 12.62 (12.61–12.80) | 1.70 (1.53–1.76) | 1.92 (1.75–1.96) | 15.01 (14.86–15.06) | 0 | 22 (21–23) | 5.65 (5.62–5.67) | 121 (121–121) | 74 (71–74) | 120 | 230 (230–230) | 515 | 2023 (2000–2026) |

#### DSA2 (STEP, 105.7 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 3 | 8.26 (7.98–9.03) | 2.08 (2.01–2.43) | 5.13 (5.03–6.10) | 3.00 (2.96–3.38) | 3.17 (3.13–3.59) | 9.16 (8.97–9.90) | 0 | 23 (23–25) | 4.06 (4.01–4.72) | 371 (365–405) | 357 (137–371) | 199 | 286 | 83 | 1802 (1791–1810) |
| windowedHandle | artifact hit | 3 | 0.18 (0.16–0.18) | — | — | 0.45 (0.40–0.46) | — | 0.40 (0.35–0.41) | — | 6 | 1.03 (0.93–1.03) | — | — | — | — | — | 1494 (1488–1499) |
| windowedHandle | sidecar reopen | 3 | 5.97 (5.88–6.30) | 0.75 (0.74–0.76) | 4.76 (4.60–4.98) | 1.43 (1.34–1.45) | 1.58 (1.48–1.61) | 6.85 (6.79–7.20) | 0 | 16 (15–18) | 2.92 (2.88–3.39) | 421 (409–451) | 409 (399–409) | 199 | 286 | 83 | 1642 (1616–1721) |
| windowedHeld | cold | 3 | 8.13 (8.02–8.67) | 2.03 (2.01–2.16) | 5.27 (4.90–5.83) | 3.01 (2.95–3.28) | 3.17 (3.11–3.43) | 9.01 (8.74–9.56) | 0 | 23 (22–24) | 4.30 (3.83–4.62) | 523 (511–523) | 475 (467–479) | 199 | 286 | 83 | 1936 (1888–1976) |
| buffered | cold | 3 | 6.77 (6.74–7.12) | 1.72 (1.70–1.96) | 4.40 (4.03–4.66) | 2.54 (2.39–2.75) | 2.70 (2.56–2.92) | 7.70 (7.63–8.03) | 0 | 22 (20–24) | 4.25 (4.00–4.45) | 205 (199–211) | 171 (171–175) | 199 | 286 | 83 | 1664 (1622–1669) |
| heldBuffer | cold | 3 | 7.35 (7.25–7.39) | 2.00 (1.99–2.00) | 4.40 (4.36–4.41) | 2.99 (2.92–3.05) | 3.16 (3.14–3.24) | 8.21 (8.19–8.37) | 0 | 22 (22–23) | 4.00 (3.91–4.18) | 275 (275–275) | 171 (171–171) | 199 | 286 | 83 | 1728 (1598–1732) |
| heldBuffer | artifact hit | 3 | 0.17 (0.17–0.17) | — | — | 0.46 (0.44–0.47) | — | 0.41 (0.39–0.41) | — | 6 (4–7) | 1.02 (0.87–1.07) | — | — | — | — | — | 1430 (1424–1431) |
| heldBuffer | sidecar reopen | 3 | 6.36 (6.10–7.22) | 0.71 (0.69–0.77) | 5.08 (4.85–5.81) | 1.39 (1.36–1.56) | 1.53 (1.53–1.73) | 7.26 (7.01–8.17) | 0 | 16 (16–17) | 3.26 (2.94–3.69) | 526 | 510 (510–514) | 199 | 286 | 83 | 1721 (1716–1726) |
| noSidecar | cold | 3 | 7.90 (7.18–8.07) | 1.90 (1.84–1.99) | 5.11 (4.61–5.22) | 2.81 (2.69–2.89) | 2.97 (2.85–3.05) | 8.82 (7.99–9.05) | 0 | 22 (20–24) | 4.44 (3.57–4.54) | 379 (371–387) | 371 (371–379) | 199 | 286 | 83 | 1781 (1750–1790) |

#### sp-231MB (IFC, 231.4 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 3 | 20.38 (19.71–20.89) | 4.50 (4.30–4.68) | 14.18 (14.09–14.81) | 1.24 (1.13–1.26) | 5.94 (5.58–6.10) | 23.45 (22.10–23.56) | 1879 (1879–1914) | 32 (31–35) | 9.81 (9.62–10.29) | 926 (890–1065) | 594 (592–757) | 153 | 57 | 515 | 3797 (3759–4056) |
| windowedHandle | artifact hit | 3 | 2.32 (2.09–2.36) | — | — | 2.67 (2.46–2.74) | — | 2.65 (2.43–2.71) | — | 8 (7–9) | 3.15 (2.99–3.15) | — | — | — | — | — | 3604 (3553–3853) |
| windowedHandle | sidecar reopen | 3 | 17.31 (16.87–18.52) | 1.65 (1.64–1.69) | 14.82 (14.45–16.17) | 2.17 (2.14–2.26) | 2.40 (2.38–2.47) | 19.75 (19.45–21.12) | 0 | 26 (20–26) | 8.62 (8.26–9.26) | 1025 (985–1026) | 970 (592–972) | 153 | 57 | 515 | 4036 (4027–4270) |
| windowedHeld | cold | 3 | 20.94 (20.77–21.41) | 4.53 (4.52–4.67) | 14.69 (14.53–15.26) | 1.44 (1.34–1.56) | 6.12 (6.06–6.46) | 23.69 (23.61–24.23) | 1879 (1075–1879) | 36 (32–36) | 10.34 (9.94–10.67) | 1297 (1256–1297) | 996 (860–1019) | 153 | 57 | 515 | 4362 (4067–4526) |
| buffered | cold | 3 | 15.41 (15.01–15.66) | 3.01 (3.01–3.16) | 11.01 (10.62–11.33) | 1.03 (0.97–1.05) | 4.12 (4.05–4.16) | 18.02 (17.22–18.34) | 2185 (2185–2480) | 26 (26–28) | 8.60 (7.59–8.62) | 377 | 309 (309–310) | 321 | 57 | 515 | 4247 (3866–4389) |
| heldBuffer | cold | 3 | 16.72 (16.34–16.95) | 3.40 (3.37–3.40) | 11.56 (11.41–11.91) | 1.43 (1.29–1.54) | 4.91 (4.72–4.94) | 19.32 (19.07–19.34) | 2527 (2480–2806) | 26 (26–30) | 9.49 (8.46–9.50) | 417 (417–418) | 308 (307–311) | 321 | 57 | 515 | 3945 (3894–4048) |
| heldBuffer | artifact hit | 3 | 2.49 (2.33–2.54) | — | — | 2.87 (2.73–2.92) | — | 2.84 (2.69–2.89) | — | 8 (7–9) | 3.35 (3.11–3.43) | — | — | — | — | — | 3720 (3669–3823) |
| heldBuffer | sidecar reopen | 3 | 17.79 (17.38–19.48) | 1.85 (1.82–1.86) | 14.80 (14.43–16.55) | 2.71 (2.63–2.85) | 3.06 (2.91–3.08) | 20.09 (20.06–21.78) | 0 | 27 (25–29) | 9.38 (8.19–9.86) | 1257 (1256–1257) | 1004 (1003–1010) | 153 | 57 | 515 | 4507 (4123–4609) |
| noSidecar | cold | 3 | 20.41 (20.11–20.50) | 4.44 (4.37–4.49) | 14.29 (14.21–14.48) | 1.25 (1.24–1.28) | 5.86 (5.80–5.94) | 23.16 (22.17–23.37) | 1879 (1075–1879) | 30 (28–33) | 9.52 (9.00–9.86) | 940 (940–1025) | 833 (592–836) | 153 | 57 | 515 | 4183 (4041–4260) |

#### D3D (IFC, 213.6 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 3 | 55.27 (54.54–55.39) | 5.42 (5.39–5.49) | 48.29 (47.42–48.30) | 1.28 (1.22–1.31) | 9.69 (9.54–9.82) | 65.34 (64.50–65.97) | 1117 (1110–1147) | 39 (38–43) | 31.71 (30.56–32.29) | 565 (550–574) | 423 (374–427) | 355 | 276 | 611 | 4662 (4639–4813) |
| windowedHandle | artifact hit | 3 | 2.94 (2.92–3.56) | — | — | 5.13 (5.01–5.86) | — | 5.10 (4.98–5.83) | — | 10 (9–10) | 5.64 (5.43–6.42) | — | — | — | — | — | 2926 (2469–3017) |
| windowedHandle | sidecar reopen | 3 | 52.46 (50.39–52.89) | 1.74 (1.68–1.86) | 49.81 (47.65–49.97) | 5.89 (5.47–6.27) | 5.60 (5.14–5.99) | 62.58 (59.49–63.75) | 0 | 40 (28–41) | 28.43 (27.39–30.32) | 543 (541–544) | 395 (383–411) | 355 | 276 | 611 | 4294 (3811–4324) |
| windowedHeld | cold | 3 | 54.75 (53.82–55.23) | 5.52 (5.37–5.62) | 47.30 (46.66–47.73) | 1.58 (1.51–1.67) | 10.21 (9.68–10.29) | 65.68 (63.78–65.78) | 1129 (1058–1144) | 43 (43–45) | 31.93 (31.22–32.10) | 790 (778–956) | 636 (636–641) | 355 | 276 | 611 | 5069 (4846–5076) |
| buffered | cold | 3 | 43.70 (41.24–43.99) | 3.97 (3.93–4.11) | 38.28 (35.70–38.47) | 0.96 (0.94–1.00) | 7.56 (7.43–7.64) | 54.19 (51.19–54.60) | 4681 (4675–4681) | 33 (33–36) | 27.06 (25.57–28.49) | 657 (654–664) | 386 (385–386) | 371 | 275 | 611 | 5117 (4999–5118) |
| heldBuffer | cold | 3 | 43.39 (42.93–44.30) | 4.38 (4.13–4.39) | 37.26 (37.03–38.05) | 1.36 (1.29–1.42) | 8.35 (7.99–8.50) | 53.32 (53.14–53.82) | 4681 | 33 (32–36) | 25.87 (25.12–28.78) | 658 (649–660) | 385 (385–386) | 371 | 275 | 611 | 5065 (4954–5105) |
| heldBuffer | artifact hit | 3 | 2.74 (2.57–2.96) | — | — | 4.87 (4.55–5.15) | — | 4.84 (4.52–5.12) | — | 10 (9–10) | 5.40 (4.99–5.61) | — | — | — | — | — | 3713 (3697–3735) |
| heldBuffer | sidecar reopen | 3 | 50.71 (50.64–53.31) | 1.84 (1.74–2.06) | 47.82 (47.51–49.99) | 5.88 (5.69–6.90) | 5.60 (5.39–6.60) | 60.91 (60.62–64.21) | 0 | 37 (32–39) | 29.15 (28.93–29.65) | 785 (774–812) | 641 (636–641) | 355 | 276 | 611 | 5032 (5009–5203) |
| noSidecar | cold | 3 | 55.30 (53.52–55.35) | 5.27 (5.15–5.47) | 48.06 (46.63–48.67) | 1.30 (1.19–1.32) | 9.59 (9.13–9.60) | 66.09 (63.37–66.81) | 1065 (1028–1097) | 40 (40–42) | 30.80 (29.70–32.42) | 538 (536–597) | 422 (387–423) | 355 | 276 (276–276) | 611 | 4808 (4695–4840) |

#### Cold engine time, median, relative to windowedHandle

| Model | MiB | windowedHandle | windowedHeld | buffered | heldBuffer | noSidecar |
|---|---|---|---|---|---|---|
| Arty_Z7 (step) | 55.5 | 14.12 s | 14.04 s (-1 %) | 13.63 s (-3 %) | 13.74 s (-3 %) | 14.28 s (+1 %) |
| DSA2 (step) | 105.7 | 8.26 s | 8.13 s (-2 %) | 6.77 s (-18 %) | 7.35 s (-11 %) | 7.90 s (-4 %) |
| sp-231MB (ifc) | 231.4 | 20.38 s | 20.94 s (+3 %) | 15.41 s (-24 %) | 16.72 s (-18 %) | 20.41 s (+0 %) |
| D3D (ifc) | 213.6 | 55.27 s | 54.75 s (-1 %) | 43.70 s (-21 %) | 43.39 s (-21 %) | 55.30 s (+0 %) |

### Large models

#### PSB (IFC, 860.7 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 2 | 36.45 (35.84–37.06) | 12.08 (11.78–12.39) | 20.75 (20.62–20.88) | 3.49 (3.06–3.91) | 15.90 (15.24–16.57) | 39.74 (39.49–40.00) | 669 (665–673) | 60 (56–63) | 16.81 (16.72–16.90) | 1083 (1025–1141) | 863 (859–867) | 300 | 27 | 899 | 4621 (4610–4631) |
| windowedHandle | artifact hit | 2 | 3.19 (3.13–3.26) | — | — | 3.52 (3.47–3.58) | — | 3.49 (3.44–3.54) | — | 9 | 3.95 (3.94–3.96) | — | — | — | — | — | 3941 (3909–3973) |
| windowedHandle | sidecar reopen | 2 | 23.49 (23.24–23.73) | 3.04 (3.02–3.06) | 19.47 (19.29–19.65) | 3.75 (3.70–3.80) | 4.38 (4.37–4.38) | 26.82 (26.49–27.14) | 0 | 28 (27–29) | 12.16 (11.78–12.54) | 1372 (1141–1602) | 783 (783–784) | 300 | 27 | 899 | 5086 (4586–5586) |
| windowedHeld | cold | 2 | 37.62 (37.42–37.83) | 11.89 (11.70–12.09) | 21.29 (21.00–21.57) | 4.32 (4.12–4.53) | 16.70 (16.20–17.21) | 41.19 (40.72–41.66) | 641 (637–645) | 55 (54–55) | 16.72 (16.58–16.85) | 2326 (2210–2443) | 1761 (1662–1860) | 300 | 27 | 899 | 5505 (5486–5524) |
| buffered | cold | 2 | 30.24 (30.11–30.36) | 9.65 (9.48–9.83) | 17.80 (17.59–18.01) | 2.63 (2.49–2.77) | 12.29 (12.23–12.35) | 33.42 (33.36–33.48) | 2173 (2167–2178) | 42 (40–43) | 16.26 (16.20–16.32) | 1243 (1242–1243) | 1243 (1242–1243) | 1096 | 27 | 922 | 6413 (6409–6417) |
| heldBuffer | cold | 2 | 32.26 (31.93–32.60) | 11.06 (11.04–11.09) | 16.50 (15.98–17.02) | 4.27 (4.14–4.41) | 15.49 (15.43–15.54) | 35.67 (35.39–35.95) | 2301 (2180–2421) | 45 (43–46) | 13.62 (13.57–13.68) | 1389 | 1241 (1240–1241) | 1096 | 27 (27–27) | 922 | 6412 (6410–6413) |
| heldBuffer | artifact hit | 2 | 3.15 (3.09–3.20) | — | — | 3.51 (3.50–3.52) | — | 3.47 (3.46–3.48) | — | 10 (9–10) | 3.96 (3.91–4.02) | — | — | — | — | — | 2789 (2769–2809) |
| heldBuffer | sidecar reopen | 2 | 25.82 (25.63–26.02) | 3.18 (3.09–3.27) | 20.54 (20.47–20.61) | 5.10 (4.87–5.33) | 5.79 (5.60–5.98) | 29.16 (28.78–29.55) | 0 | 29 | 12.39 (12.16–12.63) | 2464 (2322–2607) | 1675 (1643–1708) | 300 | 27 | 899 | 5449 (5439–5459) |
| noSidecar | cold | 2 | 33.26 (33.07–33.45) | 10.73 (10.66–10.79) | 19.14 (18.96–19.32) | 3.19 (3.10–3.28) | 14.46 (14.38–14.54) | 36.55 | 613 (577–648) | 51 (50–51) | 14.99 (14.96–15.03) | 1397 (1325–1469) | 867 (866–868) | 300 | 27 (27–27) | 899 | 4555 (4517–4592) |

#### DOWA (IFC, 398.4 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 2 | 27.08 (26.14–28.01) | 7.13 (7.00–7.26) | 17.95 (17.01–18.88) | 8.00 (7.01–8.98) | 9.88 (9.66–10.10) | 32.95 (31.73–34.16) | 216 (0–431) | 47 (41–52) | 16.53 (14.90–18.17) | 1068 | 689 (649–728) | 387 | 75 (74–75) | 429 | 3895 (3868–3922) |
| windowedHandle | artifact hit | 2 | 2.06 (1.96–2.15) | — | — | 2.82 (2.74–2.90) | — | 2.74 (2.62–2.87) | — | 8 (6–9) | 3.14 (2.98–3.29) | — | — | — | — | — | 3084 (3073–3094) |
| windowedHandle | sidecar reopen | 2 | 23.72 (23.70–23.74) | 1.96 (1.91–2.02) | 20.95 (20.86–21.04) | 2.64 (2.57–2.72) | 3.41 (3.35–3.47) | 29.17 (28.85–29.49) | 0 | 25 (24–25) | 16.25 (15.91–16.60) | 1171 (1162–1179) | 596 (565–628) | 387 | 75 (74–75) | 429 | 4239 (4127–4351) |
| windowedHeld | cold | 2 | 25.62 (25.28–25.96) | 6.59 (6.53–6.64) | 16.69 (16.32–17.06) | 8.75 (8.72–8.77) | 9.62 (9.61–9.63) | 31.09 (30.66–31.53) | 0 | 44 (42–46) | 13.94 (13.72–14.16) | 1521 (1472–1570) | 1093 (951–1235) | 387 | 75 (74–75) | 429 | 4221 (4220–4221) |
| buffered | cold | 2 | 21.21 (20.62–21.81) | 4.95 (4.85–5.04) | 14.45 (13.94–14.96) | 5.92 (5.09–6.75) | 7.17 (6.95–7.39) | 26.31 (26.22–26.41) | 323 (0–646) | 40 (39–41) | 15.76 (15.45–16.07) | 957 (932–982) | 561 (527–594) | 530 | 74 | 429 | 4471 (4462–4479) |
| heldBuffer | cold | 2 | 24.25 (23.51–25.00) | 5.34 (5.30–5.39) | 16.50 (15.63–17.37) | 6.29 (5.96–6.63) | 8.24 (8.13–8.34) | 29.58 (28.19–30.97) | 860 (217–1502) | 41 (38–44) | 16.34 (15.00–17.69) | 911 (874–947) | 561 (527–594) | 530 | 74 | 429 | 4349 (4174–4523) |
| heldBuffer | artifact hit | 2 | 2.00 (1.94–2.07) | — | — | 2.75 (2.66–2.83) | — | 2.70 (2.62–2.78) | — | 9 (7–10) | 3.18 (3.01–3.35) | — | — | — | — | — | 3101 (2917–3284) |
| heldBuffer | sidecar reopen | 2 | 20.70 (19.74–21.66) | 2.11 (2.06–2.17) | 17.34 (16.52–18.15) | 3.17 (3.04–3.31) | 4.05 (3.92–4.17) | 26.23 (25.52–26.93) | 0 | 29 (25–33) | 12.40 (11.96–12.83) | 1537 (1513–1561) | 1017 (1007–1027) | 387 | 74 | 429 | 4493 (4288–4698) |
| noSidecar | cold | 2 | 24.77 (24.15–25.39) | 6.26 (5.95–6.58) | 16.61 (16.34–16.88) | 7.21 (6.87–7.55) | 8.81 (8.34–9.28) | 30.08 (29.33–30.83) | 109 (0–217) | 41 (40–41) | 14.95 (13.77–16.12) | 1093 (1068–1117) | 623 (613–632) | 387 | 75 (74–75) | 429 | 3913 (3871–3955) |

#### BLSN_007 (STEP, 268.6 MiB)

| Arm | Phase | n | Engine | Parse | Geometry | 1st mesh | Index | Ready | Prev@idx | LT n | LT s | W peak | W idx | W spill | W heap spill | wasm | R peak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| windowedHandle | cold | 2 | 23.33 (23.31–23.35) | 3.55 (3.55–3.56) | 18.51 (18.44–18.59) | 5.05 (5.01–5.09) | 4.81 (4.76–4.87) | 23.76 (23.72–23.80) | 0 | 44 (43–45) | 7.26 (7.22–7.30) | 709 | 244 (168–320) | 211 | 612 | 429 | 2952 (2918–2986) |
| windowedHandle | artifact hit | 2 | 0.41 (0.40–0.42) | — | — | 0.56 (0.55–0.58) | — | 0.53 (0.52–0.55) | — | 6 (5–6) | 0.99 (0.94–1.03) | — | — | — | — | — | 2239 (2236–2242) |
| windowedHandle | sidecar reopen | 2 | 19.96 (19.68–20.24) | 0.92 (0.91–0.93) | 18.52 (18.26–18.77) | 1.75 (1.70–1.79) | 1.44 (1.42–1.47) | 20.43 (20.12–20.74) | 0 | 31 | 5.88 (5.69–6.06) | 609 (601–616) | 319 (286–351) | 211 | 611 | 429 | 2943 (2921–2965) |
| windowedHeld | cold | 2 | 23.89 (23.54–24.24) | 3.42 (3.42–3.42) | 18.96 (18.60–19.31) | 5.19 (5.18–5.20) | 4.94 (4.93–4.94) | 24.30 (23.96–24.64) | 0 | 45 | 7.50 (7.46–7.55) | 934 | 563 (557–569) | 211 | 612 | 429 | 3242 (3219–3265) |
| buffered | cold | 2 | 20.98 (20.66–21.30) | 2.84 (2.82–2.87) | 16.95 (16.66–17.24) | 4.13 (4.07–4.20) | 4.14 (3.91–4.38) | 21.46 (21.08–21.83) | 0 | 41 (39–42) | 7.10 (7.05–7.15) | 420 (420–421) | 357 (357–357) | 419 | 611 | 429 | 2642 (2633–2651) |
| heldBuffer | cold | 2 | 22.21 (22.07–22.35) | 3.25 (3.23–3.27) | 17.30 (17.08–17.53) | 5.06 (5.00–5.12) | 5.09 (4.89–5.29) | 22.64 (22.51–22.77) | 0 | 42 (41–43) | 6.94 (6.92–6.96) | 544 | 357 (356–357) | 419 | 612 (611–612) | 429 | 2632 (2630–2634) |
| heldBuffer | artifact hit | 2 | 0.41 (0.41–0.41) | — | — | 0.56 (0.56–0.57) | — | 0.54 (0.53–0.54) | — | 8 (7–8) | 1.14 (1.10–1.17) | — | — | — | — | — | 2293 |
| heldBuffer | sidecar reopen | 2 | 19.69 (19.68–19.70) | 0.98 (0.96–1.01) | 17.90 (17.87–17.93) | 2.09 (2.08–2.09) | 1.81 (1.79–1.82) | 20.10 (20.09–20.11) | 0 | 31 (30–31) | 5.82 (5.81–5.82) | 901 (889–913) | 590 (549–632) | 211 | 611 | 429 | 3214 (3169–3259) |
| noSidecar | cold | 2 | 22.90 (22.85–22.95) | 3.15 (3.07–3.23) | 18.34 (18.26–18.43) | 4.74 (4.65–4.82) | 4.53 (4.49–4.58) | 23.35 (23.33–23.37) | 0 | 40 (39–41) | 7.01 (6.99–7.04) | 612 (608–616) | 340 | 211 | 612 | 429 | 2983 (2980–2986) |

#### Cold engine time, median, relative to windowedHandle

| Model | MiB | windowedHandle | windowedHeld | buffered | heldBuffer | noSidecar |
|---|---|---|---|---|---|---|
| PSB (ifc) | 860.7 | 36.45 s | 37.62 s (+3 %) | 30.24 s (-17 %) | 32.26 s (-11 %) | 33.26 s (-9 %) |
| DOWA (ifc) | 398.4 | 27.08 s | 25.62 s (-5 %) | 21.21 s (-22 %) | 24.25 s (-10 %) | 24.77 s (-9 %) |
| BLSN_007 (step) | 268.6 | 23.33 s | 23.89 s (+2 %) | 20.98 s (-10 %) | 22.21 s (-5 %) | 22.90 s (-2 %) |
