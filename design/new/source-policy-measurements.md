# Source-policy measurements: buffered vs windowed, by size, format and store

Measurements for the engine's **source policy** (Share#2139, Share#2092): when
an open should read the whole file into the engine worker (buffered) and when it
should page it through a window (windowed). This doc is numbers and what they
do and don't show; the policy itself is written elsewhere. The harness is
[tools/bench/sourceModes/](../../tools/bench/sourceModes/README.md), and its
README is the record schema and the confounder list.

**Status (2026-11-11):** small models (2 to 31 MiB, IFC and STEP) done at
n = 5; medium and large in progress, filled in below as they land.


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
  **not** seen retaining the source after spill. The conway retention bug
  (Share#2139 step 1) was measured on PSB, 1,150 MB against 314; see the
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

### Small-model tables

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
