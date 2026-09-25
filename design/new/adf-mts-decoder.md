# ADF crown meshes: a JavaScript MetaStream decoder

Status: **spec, not started.** Measurements below are reproducible with
[`tools/adf-mts/probe.py`](../../tools/adf-mts/probe.py).

Share opens Align ClinCheck `.adf` dental scans (`src/loader/adf.js`, vendored
parser under `src/loader/adf/`) but draws each tooth as a parametric *proxy*.
Every tooth's real crown is in the file, compressed as a **MetaStream 3**
progressive mesh (Viewpoint VET, 1998–2000). Today the only decoder is
Viewpoint's own `Mts3Reader.dll`, run under a CPU emulator by
pablo-mayrgundter/freality `bio/med/dental/tools/mts/` to write a
`PM.meshes.bin` sidecar offline. This doc specs a pure-JS decoder so Share can
draw real crowns for any ADF, with no sidecar and no DLL.


## 1. What we know (measured)

All on `PM.adf` (27 teeth → 54 blobs: 27 crowns + 27 `InitialToothShape`s),
DLL `Mts3Reader.dll` 3.0.15.12, sha256 `a87b0712…fc0b765`.

| Fact | Evidence |
|---|---|
| The emulator reproduces the checked-in sidecar **byte for byte**, so `PM.meshes.bin` is a pure function of `PM.adf` + the DLL. | `build_meshes.py` rerun, `cmp` identical |
| One crown decode (tooth 8, 3016 verts) runs **226 functions / 8,403 distinct x86 instructions**, 13.9M executed. Teeth 2, 8, 30 run the identical function set. | `probe.py profile` |
| **86%** of it is the vertex-split routine `0x1181c5e0` (3014 calls = one per split). | `profile` |
| The base mesh is **2 vertices, 0 faces** (its decoder `0x1181aef0` runs once, 102 instructions). Everything else is vertex splits: each adds 1 vertex and 2 faces (`F = 2V − 4`, closed genus 0). | `profile`, face/vertex counts |
| There are **two entropy coders** sharing **one bit cursor**: a 16-bit arithmetic coder for connectivity/attributes and raw bits for coordinates, interleaved in decode order. | `probe.py streams`: both read BitStream `0x40003c50` |
| Positions are **16-bit quantized** integers (0..65535), dequantized as `float32(i · scale + offset)` with float32 `scale`/`offset` per axis. In JS, `Math.fround(i * scale + offset)` in doubles matches the x87 result **bit for bit on all 215,704 vertices** of all 54 blobs. | `probe.py fp`: 0 mismatches |
| After the first vertex, every position is a **delta from a reference vertex**. The first is "absolute", but its range is `[x, x+1)`, so it costs zero bits. | `probe.py census` |
| The arithmetic stream uses **9 adaptive models** (alphabets 1–7) and one **uniform** decode (`n ≤ 13`), with ~6 symbols per split. | `census` |

So the port is mostly **integer bookkeeping plus one progressive-mesh topology
routine**. Floating point is one multiply-add per coordinate, and it's
already verified exact.


## 2. Decoder anatomy

Addresses are `Mts3Reader.dll` 3.0.15.12 (image base `0x11800000`). "static"
means distinct instructions executed while decoding tooth 8, which is a
rough size for the port.

| Stage | Routine | static | What it is |
|---|---|---|---|
| Container | (Python `mts.streams`) | — | `"mts"` header, varint-sized typed chunks; a type's stream = its chunks' payloads concatenated (see freality `tools/mts/README.md`). **Known.** |
| Bit reader | inline everywhere | — | LSB-first: bit `p` is `(bytes[p >> 3] >> (p & 7)) & 1`. `ReadUInt` = 5-bit length `L`, then `L−1` bits, value `(1 << (L−1)) \| bits`. **Known.** |
| Driver + header | `0x1180faa0` | 239 | Flags, version, optional key, plug-in headers, counts, quantization parameters; then base mesh, then the split loop. |
| Coordinate trees | `0x1181b5b0` → `0x11822840` → `0x118226c0` (recursive) | ~190 | Builds 6 interval trees once per stream (3 axes × {delta, absolute}) from header data. |
| Base mesh | `0x1181aef0` | 102 | Trivial for Align streams (2 verts, 0 faces). Port the general case only if a stream needs it; fail loudly otherwise. |
| **Vertex split** | `0x1181c5e0` + helpers | 834 + ~5k | Picks where to split (arithmetic symbols + uniform), updates the quad-edge mesh, runs the attribute plug-ins. **The bulk of the work.** |
| Attribute plug-ins | `0x1181a330` / `0x1181a360` / `0x1181a390` | — | Per split: position (`0x11819790`), a 5-symbol attribute decoded twice per split (`0x118147f0`), most likely one per new face, and a plug-in (`0x118146f0` → `0x1181a910`) that reads no bits. |
| Output | `0x11814940` (take-mesh) | 130 | Walks the face list into arrays. The port writes its own arrays. |

### 2.1 Arithmetic decoder (fully read; port literally)

State: `low`, `range`, `value` (16-bit), `bitsLeft`, shared `bitstream`.

```
start(bs, budget):                       // 0x11822b50
  low = 0; range = 0x10000; value = 0; bitsLeft = budget
  repeat 16: value = (value << 1) | nextBit()   // nextBit() is 0 once bitsLeft is spent
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

Adaptive model (`0x11822a70` update, `0x11822b10` lookup). Entries are
`{freq, cum}` for `k = 0..n−1`, with `cum` accumulated **from the top**
(`cum[k] = Σ freq[j≥k]`, `cum[0]` = total, `cum[n] = 0`), plus `incShift` and
`rescaleShift`:

```
lookup(target): largest k with cum[k] > target      // binary search, 0x11822b10
update(s):
  inc = (cum[0] >> incShift) + 1
  freq[s] += inc; for k = s..0: cum[k] += inc
  if cum[0] > 0x3fff:                                // rescale
    acc = 0
    for k = n−1..0: f = (freq[k] + (1 << (rescaleShift−1))) >> rescaleShift
                    if f == 0 && freq[k] != 0: f = 1
                    freq[k] = f; acc += f; cum[k] = acc
```

Decoding. `range_old` is `range` on entry. Every division truncates, and
every product fits in int32 (16-bit range × 14-bit totals), so plain JS
numbers with `Math.trunc` are enough:

```
symbol(m):                               // 0x11822ca0; the caller then calls m.update(s)
  t = floor(((value − low + 1) · cum[0] − 1) / range)
  s = m.lookup(t)
  lo = cum[s+1]; hi = cum[s]
  range = trunc((hi − lo) · range_old / cum[0]);  low += trunc(lo · range_old / cum[0]);  renorm()
symbolBounded(m, limit):                 // 0x11822d50: symbol restricted to [0, min(limit, n−1))
  base = cum[min(limit, n−1)]; tot = cum[0] − base
  t = floor(((value − low + 1) · tot − 1) / range) + base
  s = m.lookup(t); lo = cum[s+1]; hi = cum[s]
  range = trunc((hi − lo) · range_old / tot);  low += trunc((lo − base) · range_old / tot);  renorm()
uniform(n):                              // 0x11822d10
  t = floor(((value − low + 1) · n − 1) / range)
  range = trunc(range_old / n);  low += trunc(t · range_old / n);  renorm();  return t
```

The model's initial frequencies, `incShift` and `rescaleShift`, and where each
of the 9 models is created are **still to be read** (milestone M2). The
census gives the targets:

| Call site | Kind | Alphabet | Calls (tooth 8) | Likely role |
|---|---|---|---|---|
| `0x1181e2f4` | bounded | 7 | 2921 | common-case split parameter |
| `0x1181e141` | symbol | 2 | 3014 | per-split flag (common vs rare branch) |
| `0x1181e1a1` | symbol | 1 | 3014 | per-split, carries no information but updates |
| `0x1181e171`, `…1d7`, `…214`, `…247`, `…277`, `…2b4` | mixed | 1–7 | ~93 each | rare-case split (93 of 3014) |
| `0x1181e323` | uniform | n = 1..13 | 3754 | choice among a vertex's neighbours (valence-sized) |
| `0x11814835` | symbol | 5 | 6028 | per-face attribute of each new face |

### 2.2 Coordinates (fully read)

```
readTreeInt(tree, bs):                   // 0x118228f0, raw bits, no arithmetic coding
  lo = tree.lo; hi = tree.hi; node = tree.root
  while lo < hi − 1 && node:
    if bs.read1(): lo = node.lo; node = node.right     // node: +0 lo, +4 hi, +8 left, +0xc right
    else:          hi = node.hi; node = node.left
  while hi > lo + 1:                           // then plain bisection
    mid = (lo + hi) >> 1                       // arithmetic shift: floor for negatives
    if bs.read1(): lo = mid else hi = mid
  return lo

position(ref):                           // 0x11819790
  if ref >= 0: q = qint[ref] + (readTreeInt(delta.x), …y, …z)
  else:        q = (readTreeInt(abs.x), …y, …z)
  qint.push(q)
  pos.push(Math.fround(q.x * scale.x + offset.x), …)   // verified bit-exact
```

`ref`, the vertex a new position is predicted from, comes from the split
routine. Per-axis delta ranges for tooth 8 are e.g. `[−14892, 28526)`. How
the trees are built from the header (`0x118226c0`) is **still to be read**
(M3).


## 3. Where the code goes

- **`src/loader/mts/`**, Share-owned (not under the vendored `loader/adf/`).
  MetaStream is a general 3D format, not an Align one. Suggested modules:
  `container.js`, `bitstream.js`, `arith.js`, `trees.js`, `header.js`,
  `splits.js`, and `index.js` exporting
  `decodeMts(bytes) → {positions: Float32Array, indices: Uint32Array}`.
- **Integration in `src/loader/adf.js`**, with no change to the vendored
  loader: `ADFLoader#parse(buffer, {meshes})` already accepts parsed sidecar
  entries (`{toothId, kind, min, max, positions, indices}`). The glue walks
  `parseADF(buffer)` for each tooth's `CompressedQedge.CompressedData`, decodes
  it, and passes the entries in. Parsing twice costs milliseconds.
  - Winding: `build_meshes.py` reverses faces when the signed volume is
    negative. Do the same until the rule is understood.
  - A tooth whose blob fails to decode keeps its proxy and logs once. One bad
    tooth mustn't fail the model.
- **Performance target:** all 27 crowns under 500 ms on a desktop, measured.
  The emulator's ~14M x86 instructions per crown include allocator and
  quad-edge overhead that typed arrays avoid. If the target is missed, decode
  in a worker.


## 4. Verification: the emulator as oracle

CI can't run the DLL (not redistributable). So the emulator produces
**committed fixtures** once, and Jest tests the JS against them. Fixtures
are derived from `PM.adf` only; they contain no Viewpoint code.

1. **Event trace** (new `probe.py oracle` subcommand, M0). Hook the coder
   entry points in §2.1/§2.2 and record, in order, one row per event:
   `{kind, callSite, modelId, arg, result, bitPos}`. That's ~28k rows for
   tooth 8 (~19k arithmetic, ~9k raw). Also dump the 6 coordinate trees after setup, and the final
   `qint`, positions and faces.
2. **Driven replay tests** (M2, M3). Feed the JS coder the oracle's
   `(kind, model, arg)` sequence and assert the same `result` and `bitPos`
   at every row. This proves the arithmetic coder, models and trees
   **independently of the topology code**, which is the risky part.
3. **Free-running decode** (M4). The JS decoder produces its own event
   stream. The test diffs it against the oracle and reports the **first
   divergent row** (split number, call site). That turns "wrong mesh" into
   "split 1,207, site `0x1181e323`, expected 4 got 2".
4. **End to end** (M5), with no DLL:
   - All 54 blobs: positions bit-exact; faces equal after canonicalization
     (rotate each triangle to its smallest index, sort); bits consumed equal.
   - Regenerate the sidecar from JS and compare it to `PM.meshes.bin`: equal
     after canonicalization, byte-identical if the port also reproduces the
     face-list order of `0x11814940`.

Fixture budget: the tooth-8 trace plus one molar, a few hundred KB. The
end-to-end check reads `test-models/adf/PM.adf` and `PM.meshes.bin` (and the
E2E fixture copy already in Share).


## 5. Milestones

| | Deliverable | Gate |
|---|---|---|
| M0 | `probe.py oracle`: trace + trees + final mesh, for tooth 8 and a molar | Fixtures committed; `probe.py` rerun reproduces them |
| M1 | container, bit reader, `ReadUInt`, header | Header fields match an emulator memory dump; locate the caller of `start()` and where its `budget` (0x6400 for tooth 8) comes from |
| M2 | arithmetic coder + adaptive models (§2.1) | Driven replay: every arithmetic row matches |
| M3 | coordinate trees (§2.2) + position plug-in | Driven replay: every raw row matches; the 6 trees equal the dumps |
| M4 | vertex split, the per-face attribute and bookkeeping plug-ins, output arrays | Free-running trace matches to the last row on tooth 8, then on the molar |
| M5 | all 54 blobs | §4 point 4 |
| M6 | Share integration (§3) | Loader unit test asserts real vertex counts per tooth; the `Filetypes-adfLoad` golden is regenerated (real crowns); perf target met |

M4 is the unknown. The rest is either already read (§2.1, §2.2) or small.
The split routine's 834 instructions and its quad-edge helpers are where the
effort goes. The oracle is what makes that tractable: every symbol has a
known expected value and a known call site to read next.


## 6. Open questions

- **Shipping a reimplementation.** The port is an independent implementation
  of a file format, derived by studying the DLL for interoperability. The DLL
  itself is never committed. Whether that's comfortable to ship in Share is a
  product/legal call, not an engineering one; decide before M6.
- **Other ADFs.** Every measurement here is one file. Two more ADFs (ideally
  from other cases or ClinCheck versions) would show whether the base-mesh
  and rare-branch paths ever get exercised.
- **`InitialToothShape`**, the second mesh per tooth: the same decoder
  handles it (it's in the 54-blob check). Whether Share shows it is a UI
  question.
