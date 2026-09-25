# ADF crown meshes: a JavaScript MetaStream decoder

Status: **implemented** in `src/loader/mts/`, used by `src/loader/adf.js`. It
decodes all 54 meshes in `PM.adf` exactly as Viewpoint's DLL does. The one
open item is the shipping decision in §6.

Share opens Align ClinCheck `.adf` dental scans (`src/loader/adf.js`, vendored
parser under `src/loader/adf/`). Every tooth's crown is in the file as a
**MetaStream 3** progressive mesh (Viewpoint VET, 1998–2000). Until this port,
the only decoder was Viewpoint's own `Mts3Reader.dll`, run under a CPU
emulator by pablo-mayrgundter/freality `bio/med/dental/tools/mts/` to write a
`PM.meshes.bin` sidecar offline. Without it, teeth drew as parametric proxies.

The port was written by reading the DLL (disassembly plus angr's decompiler)
and checked against it running under that emulator, step by step. The tools
for that are in `tools/adf-mts/` (§4).


## 1. Results

All on `PM.adf` (27 teeth → 54 streams: 27 crowns + 27 `InitialToothShape`s),
DLL `Mts3Reader.dll` 3.0.15.12, sha256 `a87b0712…fc0b765`.

| | |
|---|---|
| Positions | **bit-identical** float32 on all 215,704 vertices |
| Faces | **identical**, including order and rotation (newest face first, as the DLL hands them over) |
| Bit cursor | ends where the DLL's does, on every stream |
| Sidecar | freality's `PM.meshes.bin`, rebuilt from the JS output with `build_meshes.py`'s packing, is **byte-identical** to the committed file |
| Speed | all 27 crowns in ~160 ms warm, ~220 ms cold (Node 22, one core); the DLL under the emulator takes ~10 s |

The DLL side, measured before porting (`tools/adf-mts/probe.py`): a crown
decode runs 226 functions, 8,403 distinct x86 instructions, 13.9M executed,
86% of them in the vertex-split routine `0x1181c5e0`.


## 2. The format, as decoded

Addresses are `Mts3Reader.dll` 3.0.15.12 (image base `0x11800000`).

### 2.1 Container and bits (`container.js`, `bitstream.js`)

- **Container:** `"mts"` + big-endian version + `$$` + 1 byte, a varint-sized
  header, then chunks of `varint length · varint typeId · [type definition on
  first use] · payload`. A type's stream is its chunks' payloads
  concatenated; the first payload byte is an object index, not data. ADF
  `CompressedData` is a uint32 size, then one stream holding one `mesh` type.
- **One bit cursor** serves everything: header fields, raw-bit coordinates,
  raw uniform choices and the arithmetic decoder, interleaved in decode order.
  Bits are LSB-first; bit `k` of a multi-bit field is stream bit `pos + k`.
- `ReadUInt` = a 5-bit length `L`, then `L − 1` bits `b`: `(1 << (L−1)) | b`,
  or 0 when `L` is 0. Strings are a `ReadUInt` length, then 8-bit characters,
  with no alignment in any header these streams use.

### 2.2 Header (`header.js`)

In stream order:

| Routine | Bits (tooth 8) | Content |
|---|---|---|
| `0x11810a90` | 0–32 | flags (bit 0: key-protected, unsupported) |
| `0x11809ab0` | 32–37 | version, must be 0 |
| `0x1180ffb0` | 37–101 | six counts: vertices, faces, base vertices, base faces, **splits**, reserved. The base mesh is empty (0, 0) in every stream. |
| `0x11819e20` | 101–190 | named plug-in parameters (`"c"`, `"T"`, `"aN"`, `"ffl"`), each followed by a 0 bit |
| `0x11819570` | 190–397 | position quantizer: bbox min, max (float32 ×3 each), bits per axis (5 bits ×3; 15/15/16). `scale = extent / (2^bits − 1)` (§2.6), `offset = min` |
| `0x11817850` | 397–412 | a vertex-attribute channel table (consumed, unused) |
| `0x11817090` | 412–480 | a 4-bit type, then one or two 32-bit words (consumed, unused) |
| `0x11814390` | 480–865 | face-flag names (`"Fbits0"`…); one 32-bit flag channel per 32 names |
| `0x1181b5b0` | 865–2338 | six coordinate trees: delta x/y/z, then absolute x/y/z (§2.5) |
| `0x1181e9c0` | 2338–2418 | the arithmetic models' shapes (§2.3), then the coder's bit budget |

Every adaptive model starts flat (frequency 1 per symbol) with
`incShift = rescaleShift = 7`. Their alphabets and offsets, in descriptor
order: a vertex-channel model (fixed: offset −1, 2 symbols, unused); the
face-flag model (offset and alphabet stored: −1, 5); then the split
decoder's models m0 and m4 (fixed at 2 symbols) and m1, m5, m2, m3, m9, m8,
m6, plus an unused tenth (alphabets stored). A "value" model returns
`symbol + offset`. A "bounded" one decodes `symbolBounded(m, limit − offset)
+ offset`, with offset 0 in practice.

### 2.3 Arithmetic decoder (`arith.js`)

A 16-bit Witten–Neal–Cleary coder. State: `low`, `range`, `value`, and
`bitsLeft`, the budget from the header. Past the budget it shifts in zeros
without moving the cursor.

```
start(bs, budget):                       // 0x11822b50
  low = 0; range = 0x10000; value = 0; bitsLeft = budget
  repeat 16: value = (value << 1) | nextBit()
nextBit(): b = (bitsLeft > 0) ? bs.read1() : 0; bitsLeft -= 1; return b

renorm():                                // 0x11822bd0
  loop:
    if low >= 0x8000:                         low -= 0x8000
    else if low + range <= 0x8000:            // nothing
    else if low >= 0x4000 && low + range <= 0xc000:
                                              value ^= 0x4000; low -= 0x4000
    else: break
    low <<= 1; range <<= 1
    value = ((value & ~0x8000) << 1) | nextBit()
```

Adaptive model (`0x11822a70` update, `0x11822b10` lookup): `{freq, cum}`
entries for `k = 0..n−1`, `cum` accumulated from the top (`cum[0]` = total,
`cum[n] = 0`):

```
lookup(target): largest k with cum[k] > target
update(s):
  inc = (cum[0] >> incShift) + 1
  freq[s] += inc; for k = s..0: cum[k] += inc
  if cum[0] > 0x3fff:
    acc = 0
    for k = n−1..0: f = (freq[k] + (1 << (rescaleShift−1))) >> rescaleShift
                    if f == 0 && freq[k] != 0: f = 1
                    freq[k] = f; acc += f; cum[k] = acc
```

Decoding (`range_old` is `range` on entry; divisions truncate; products fit
in int32):

```
symbol(m):                               // 0x11822ca0; caller then m.update(s)
  t = floor(((value − low + 1) · cum[0] − 1) / range)
  s = m.lookup(t); lo = cum[s+1]; hi = cum[s]
  range = trunc((hi − lo) · range_old / cum[0]);  low += trunc(lo · range_old / cum[0]);  renorm()
symbolBounded(m, limit):                 // 0x11822d50: symbols [0, min(limit, n)) only
  base = cum[min(limit, n)]; tot = cum[0] − base
  t = floor(((value − low + 1) · tot − 1) / range) + base
  s = m.lookup(t); lo = cum[s+1]; hi = cum[s]
  range = trunc((hi − lo) · range_old / tot);  low += trunc((lo − base) · range_old / tot);  renorm()
uniform(n):                              // 0x11822d10
  t = floor(((value − low + 1) · n − 1) / range)
  range = trunc(range_old / n);  low += trunc(t · range_old / n);  renorm();  return t
```

Two further choices are made with **raw bits**, not the coder: coordinates
(§2.5), and `rawUniform(n)` (`0x1181b500`), which is plain bisection over
`[0, n)`.

### 2.4 The mesh and its splits (`mesh.js`, `decoder.js`)

**Representation.** It's not a quad-edge but a triangle-adjacency mesh.
Face `f` has vertices `v[f][0..2]` and, across the edge opposite vertex `i`,
a link `n[f][i]`. Links are tagged half-edges `face·4 + edge`; half-edge
`(f, i)` runs `v[i+1] → v[i+2]`. Each vertex has an anchor (one outgoing
half-edge). Stepping around a vertex: `step(h) = n[face(h)][prev(edge(h))]`.
A vertex's **ring starts at the half-edge whose face was created last**
(`0x1181a910`), which makes ring positions independent of the anchor.

The decoder reproduces the DLL's link surgery exactly, not just its
topology, because the stream's choices index into this structure. That
covers ring positions, wedges, and a sorted candidate list.

**Splits.** The base mesh is empty. Each of the header's `splits` splits
first reads m0 (common or rare) and m1 (always 0; nonzero would mean extra
records, unsupported).

*Common split* (the vast majority):
1. `vs = rawUniform(vertexCount)`; a new vertex `vt`.
2. `h1 = rotate(ringStart(vs), uniform(valence))`, `e1 = prev(h1)`.
3. `s = symbolBounded(m9, valence − 1)`, `e2 = prev(rotate(twin(e1), s))`.
4. New faces `F1 = [vs, vt, b]` and `F2 = [vs, a, vt]`, in that order, where
   `a`, `b` are the tails of `e1`, `e2`. Linked in as `0x1180dcc0` does.
5. The fan from `twin(e1)` up to `F1` is relabelled `vs → vt`: `s + 1` faces.

*Rare split* (93 of 3014 in tooth 8, including the first five that build the
initial mesh). It is a general record:
1. **Counts:** m2 existing vertices (picked by running `rawUniform`) and m3
   new vertices; an m4 flag for "cut the split vertex".
2. **Split vertex:** `rawUniform(vertexCount + created)`, which may be one of
   the just-created vertices.
3. **Candidates:** a sorted set of vertex indices holding the counted
   vertices, the created ones and the split vertex's ring.
4. **Cut** (if flagged): `h1 = rotate(ringStart, uniform(valence))`,
   `h2 = rotate(h1, symbolBounded(m8, valence))`. Swapping the twin links of
   `prev(h1)` and `prev(h2)` splits the ring in two, and the half from the
   old twin moves to `vt`.
5. **Faces:** m5 is the number of new faces and m6 how many of them are
   oriented `[v, vt, x]` (the rest `[v, x, vt]`). For each face, `x` is
   `candidates[uniform(size)]`, and each corner with an existing fan is
   spliced into the wedge `uniform(valence)` picks.

**Plug-ins, per split.** Their order is fixed.
- **Face flags:** before the ring changes, the split vertex's ring face flags
  are collected (consecutive repeats dropped) as a recent list. After the new
  faces exist, each gets `value(faceFlag)`: negative picks a recent flag,
  0 reads a new 32-bit flag raw, positive picks an earlier new one.
- **Positions:** new vertices are decoded in index order, each predicted
  from the split vertex (§2.5).

### 2.5 Coordinates (`trees.js`)

```
readTreeInt(tree, bs):                   // 0x118228f0, raw bits
  lo = tree.lo; hi = tree.hi; node = tree.root
  while lo < hi − 1 && node:
    if bs.read1(): lo = node.lo; node = node.right
    else:          hi = node.hi; node = node.left
  bisect(lo, hi)                         // one bit per halving, >> 1 floors
```

A tree header (`0x11822840`) is a sign bit, a `ReadUInt` magnitude for `lo`,
and a `ReadUInt` extent. Nodes (`0x118226c0`) follow recursively, as
presence bit, `cutLo = bisect(lo, hi)`, `cutHi = bisect(cutLo, hi)`, left
subtree over `[lo, cutLo)`, right over `[cutHi, hi)`. Values in
`[cutLo, cutHi)` never occur, so they cost nothing: the encoder shapes the
tree to the data.

A vertex with a reference is `qint[ref] + (delta x, y, z)`. The first vertex
has none and uses the absolute trees, whose range is a single value, so it
costs zero bits.

### 2.6 Floating point

`position = Math.fround(q · scale + offset)` in doubles matches the DLL's x87
bit for bit on every vertex. For `scale`, the DLL keeps x's extent at full
precision but rounds y's and z's to float32 before dividing; `header.js`
mirrors that. It's verified through the positions, which use it.


## 3. Code map

| File | Role |
|---|---|
| `src/loader/mts/container.js` | MetaStream chunks → the `mesh` stream |
| `src/loader/mts/bitstream.js` | the shared bit cursor, `ReadUInt`, strings |
| `src/loader/mts/arith.js` | arithmetic decoder, adaptive model |
| `src/loader/mts/trees.js` | coordinate trees, bisection |
| `src/loader/mts/header.js` | §2.2; `UnsupportedMtsError` for paths no ADF uses |
| `src/loader/mts/mesh.js` | the split mesh (§2.4) |
| `src/loader/mts/decoder.js` | `decodeMesh(payload)`: header, split loop, plug-ins |
| `src/loader/adf.js` | `decodeCrowns(buffer)`: every crown → `*.meshes.bin`-shaped entries for the vendored `ADFLoader#parse(buffer, {meshes})`; winds faces outward by signed volume; a tooth that fails keeps its proxy |

**Robustness.** `decodeMesh` runs on the main thread, so a corrupt or
truncated stream has to throw, and quickly: a hang freezes the tab, and
`adf.js` can only fall back to a proxy crown for a tooth that throws. Every
loop and allocation is bounded by the stream's own length:

- `BitReader#read1` throws past the end. The DLL returns zeros there, but no
  valid stream reads that far, and zeros let every count-driven loop keep
  going: the header's name, parameter and channel lists, string lengths, and
  the split loop.
- `readHeader` rejects vertex, face and split counts that can't fit in the
  stream: fewer than 1 bit per vertex or split, or ½ per face. The fixture's
  densest crown spends 53 and 26. It also rejects model alphabets over 1024;
  the largest real one is 10.
- The arithmetic coder rejects:
  - a budget larger than the bits left after the header;
  - running more than 32 bits past that budget (valid streams: 14);
  - any state where `[low, low + range)` isn't a non-empty part of the 16-bit
    window;
  - a decoded target outside the model's total.

  Without the state check, a corrupt `low` goes negative, `range <<= 1`
  overflows int32 to 0, and `renorm` never returns.
- Walks around a vertex are bounded (`SplitMesh#checkWalk`).

Fuzzing `PM.adf`'s streams (random truncations, and bit flips in the header
and body) gives no case over 3 s. Every truncation throws. Before these
checks, 3% of header flips hung, and 40% of truncations decoded into wrong
coordinates without an error. `decoder.test.js` keeps representatives of each.


## 4. Verification

The DLL can't run in CI (not redistributable), so:

- `src/loader/mts/decoder.test.js` decodes all 54 streams and checks, per
  stream, the counts, final bit position, and SHA-1s of positions and faces
  against `testdata/models/adf/PM.adf.mts-dll.json`. That fixture holds the
  **DLL's** results, recorded with `tools/adf-mts/oracle.py`, so the test is
  anchored to Viewpoint's decoder, not to this port's own output.
- `src/loader/Loader.test.js` checks that every tooth loads its real crown.
- `src/Components/Open/Filetypes.spec.ts` renders it (golden `Filetypes-adfLoad`).

With the DLL at hand (`MTS_TOOLS`, `MTS_DLL`; see each script's docstring),
these tools diagnose divergences:

| Tool | Gives |
|---|---|
| `tools/adf-mts/probe.py` | profile, call-site census, the float check, bit-cursor sharing, coder seeding |
| `tools/adf-mts/oracle.py` | every primitive call in order: kind, call site, model/tree, argument, result, bit cursor; plus model and tree dumps, coder state, final mesh |
| `tools/adf-mts/meshstates.py` | the DLL's whole mesh after each split, in `SplitMesh`'s shape |

The port was built in that order. Replaying the oracle's calls proved the
coders on all 54 streams before any mesh code existed. Diffing `meshstates`
snapshots after every split then proved the split logic.


## 5. What's left

- **Other ADFs.** Everything was verified on one file. Paths it never
  exercises (a non-empty base mesh, key-protected streams, plug-in parameter
  values, flagged vertex channels, extra split records) throw
  `UnsupportedMtsError` rather than guess. A second or third ADF, ideally
  from another case or ClinCheck version, would show whether any are needed.
- **`InitialToothShape`** decodes too (it's in the 54). Showing it is a UI
  question.
- **Face flags** are decoded (they drive the stream) but not displayed.
- **Upstream.** The decoder could go back to freality's
  `bio/med/dental/src/` so its viewer stops needing the sidecar.


## 6. Open question: shipping it

The decoder is an independent implementation of a file format, written by
studying Viewpoint's DLL for interoperability. The DLL is never committed.
Whether that is comfortable to ship in Share is a product and legal call, not
an engineering one, and it should be made before this merges.
