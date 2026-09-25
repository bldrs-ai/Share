"""Snapshot Mts3Reader.dll's mesh after every vertex split, to diff the JS port against.

design/new/adf-mts-decoder.md §4. Same environment as probe.py (MTS_TOOLS, MTS_DLL,
optional ADF).

    python meshstates.py <tooth> [crown|initial] [maxSplits] [-o out.json.gz]

The DLL's mesh (the split routine's third argument): +0x14 vertex count, +0x1c/+0x20 the
face array and its length, +0x28 per-vertex anchors. A face record is
[index, nbr0, nbr1, nbr2, v0, v1, v2, flags]: links are tagged pointers (face | edge),
vertices point at 12-byte records whose first word is the vertex index.

Writes a gzipped JSON list, the empty base mesh first, then one entry per split:
  {nverts, faces: [[v0, v1, v2, n0face, n0edge, n1face, n1edge, n2face, n2edge, flags]],
   anchors: [[face, edge]]}          (face -1 = none)
which is the same shape `SplitMesh` (src/loader/mts/mesh.js) holds, so a harness can
compare them split by split and report the first divergence.
"""
import gzip
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe  # noqa: E402
from probe import mts, u32  # noqa: E402
from unicorn import UC_HOOK_CODE  # noqa: E402
from unicorn.x86_const import UC_X86_REG_ESP  # noqa: E402

SPLIT = 0x1181c5e0
SPLIT_RETURN = 0x1180fdbf  # the driver's return site after calling SPLIT


def record(tooth, which, limit):
    blob = [b for tid, kind, b in probe.blobs(tooth) if kind == which][0]
    state = {'mesh': None, 'n': 0}
    snaps = []

    def snapshot(uc):
        m = state['mesh']
        vn, fa, fn = u32(uc, m + 0x14), u32(uc, m + 0x1c), u32(uc, m + 0x20)
        aa, an = u32(uc, m + 0x28), u32(uc, m + 0x2c)
        fptrs = [u32(uc, fa + 4 * i) for i in range(fn)]
        fidx = {p: i for i, p in enumerate(fptrs)}

        def tag(t):
            return [fidx.get(t & ~3, -1), t & 3] if t else [-1, -1]
        faces = []
        for p in fptrs:
            w = [u32(uc, p + 4 * k) for k in range(8)]
            vs = [u32(uc, w[4 + k]) if w[4 + k] else -1 for k in range(3)]
            faces.append(vs + tag(w[1]) + tag(w[2]) + tag(w[3]) + [w[7]])
        snaps.append({'nverts': vn, 'faces': faces, 'anchors': [tag(u32(uc, aa + 4 * i)) for i in range(an)]})

    def on_split(uc, addr, size, e):
        state['mesh'] = u32(uc, uc.reg_read(UC_X86_REG_ESP) + 12)
        if state['n'] == 0:
            snapshot(uc)

    def on_return(uc, addr, size, e):
        if state['mesh'] is not None:
            state['n'] += 1
            if state['n'] <= limit:
                snapshot(uc)

    probe.with_hooks(lambda e: (e.uc.hook_add(UC_HOOK_CODE, on_split, e, SPLIT, SPLIT),
                                e.uc.hook_add(UC_HOOK_CODE, on_return, e, SPLIT_RETURN, SPLIT_RETURN)))
    mts.Decoder(probe.DLL).decode_blob(blob)
    return snaps


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-o')]
    out = next((a[2:] or None for a in sys.argv[1:] if a.startswith('-o')), None)
    tooth = int(args[0]) if args else 8
    which = args[1] if len(args) > 1 else 'crown'
    limit = int(args[2]) if len(args) > 2 else 10 ** 9
    snaps = record(tooth, which, limit)
    out = out or 'meshstates-%d-%s.json.gz' % (tooth, which)
    with gzip.open(out, 'wt') as fh:
        json.dump(snaps, fh, separators=(',', ':'))
    print('%d snapshots -> %s' % (len(snaps), out))
