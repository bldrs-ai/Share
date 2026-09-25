"""Record what Viewpoint's MetaStream decoder does, as test fixtures for the JS port.

See design/new/adf-mts-decoder.md §4. Same environment as probe.py
(MTS_TOOLS, MTS_DLL, optional ADF).

    python oracle.py <tooth> [crown|initial] [-o out.json.gz]

Writes one gzipped JSON document:

  events   one row per decoder primitive call, in decode order:
           [kind, site, obj, arg, result, bitPos]
             kind    see KINDS below
             site    index into `sites` (the call's return address)
             obj     model id / tree id (first-use order), -1 if none
             arg     limit (bounded), n (uniform), symbol (update), budget (start), else 0
             result  the decoded value (0 for update/start)
             bitPos  the shared BitStream's cursor after the call
  sites    return addresses, hex
  models   per model id: its struct's first words and its {freq, cum} table
           as first seen (before its first decode)
  trees    per tree id: lo, hi and nodes [lo, hi, left, right] (indices, -1 = none)
  coder    after each arithmetic call: [event index, low, range, value, bitsLeft]
  splits   per vertex split: [event index at entry, args...]
  mesh     positions (float32 bit patterns, so exactness survives JSON), faces
"""
import gzip
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe  # noqa: E402  (environment + Emu import side effects)
from probe import adf, mts, Emu, u32  # noqa: E402
import capstone  # noqa: E402
import pefile  # noqa: E402
from unicorn import UC_HOOK_CODE  # noqa: E402
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EBX, UC_X86_REG_ECX, UC_X86_REG_ESP  # noqa: E402

CODER_START = 0x11822b50
RAW_UNIFORM = 0x1181b500
RAW32_SITE = 0x1181488e  # face-attribute plug-in: ebx = 32 raw bits just read
VSPLIT = 0x1181c5e0
KINDS = {
    probe.ARITH_SYMBOL: 0,          # symbol(model)
    probe.ARITH_SYMBOL_BOUNDED: 1,  # symbolBounded(model, limit)
    probe.ARITH_UNIFORM: 2,         # uniform(n)
    probe.MODEL_UPDATE: 3,          # model.update(symbol)
    probe.RAW_TREE_INT: 4,          # readTreeInt(tree, bs)
    CODER_START: 5,                 # start(bs, budget)
    RAW_UNIFORM: 6,                 # rawUniform(n): bisection over [0, n) with raw bits
}
RAW32 = 7                           # an inline 32-bit raw read (no call); site = its address
VSPLIT_ARGS = 4  # words recorded from the split routine's stack arguments


def call_sites(dll_path, targets):
    """Return addresses of every direct `call target` in the DLL's code."""
    pe = pefile.PE(dll_path)
    base = pe.OPTIONAL_HEADER.ImageBase
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
    md.skipdata = True
    rets = {}
    for sec in pe.sections:
        if not sec.Characteristics & 0x20000000:  # IMAGE_SCN_MEM_EXECUTE
            continue
        addr = base + sec.VirtualAddress
        for i in md.disasm(sec.get_data(), addr):
            if i.mnemonic == 'call' and i.op_str.startswith('0x'):
                t = int(i.op_str, 16)
                if t in targets:
                    rets[i.address + i.size] = t
    return rets


def record(tooth, which):
    blob = [b for tid, kind, b in probe.blobs(tooth) if kind == which][0]
    rets = call_sites(probe.DLL, set(KINDS) | {VSPLIT})
    events, sites, site_ix = [], [], {}
    models, model_ix, trees, tree_ix = [], {}, [], {}
    splits, pending, state = [], [], {'bs': 0}
    coder_state = []

    def site(ret):
        if ret not in site_ix:
            site_ix[ret] = len(sites)
            sites.append('%#x' % ret)
        return site_ix[ret]

    def model_id(uc, ptr):
        if ptr not in model_ix:
            n = u32(uc, ptr + 4)  # entries: alphabet + 1 (a zero-cum sentinel)
            table = u32(uc, ptr)
            models.append({
                'head': [u32(uc, ptr + 4 * k) for k in range(6)],
                'entries': [[u32(uc, table + 8 * k), u32(uc, table + 8 * k + 4)] for k in range(n)],
            })
            model_ix[ptr] = len(model_ix)
        return model_ix[ptr]

    def tree_id(uc, ptr):
        if ptr not in tree_ix:
            nodes, node_ix = [], {}

            def walk(p):
                if p == 0:
                    return -1
                if p in node_ix:
                    return node_ix[p]
                node_ix[p] = len(nodes)
                nodes.append(None)
                lo, hi, left, right = struct.unpack('<iiII', uc.mem_read(p, 16))
                nodes[node_ix[p]] = [lo, hi, walk(left), walk(right)]
                return node_ix[p]
            root = walk(u32(uc, ptr + 0x28))
            lo, hi = struct.unpack('<ii', uc.mem_read(ptr + 0x2c, 8))
            trees.append({'lo': lo, 'hi': hi, 'root': root, 'nodes': nodes,
                          'head': [u32(uc, ptr + 4 * k) for k in range(0x34 // 4)]})
            tree_ix[ptr] = len(tree_ix)
        return tree_ix[ptr]

    def on_entry(uc, addr, size, e):
        esp = uc.reg_read(UC_X86_REG_ESP)
        ret, a0, a1 = u32(uc, esp), u32(uc, esp + 4), u32(uc, esp + 8)
        ecx = uc.reg_read(UC_X86_REG_ECX)
        if addr == VSPLIT:
            splits.append([len(events)] + [u32(uc, esp + 4 + 4 * k) for k in range(VSPLIT_ARGS)] + [ecx])
            return
        kind = KINDS[addr]
        obj, arg = -1, 0
        if kind in (0, 1):
            obj = model_id(uc, a0)
            arg = a1 if kind == 1 else 0
        elif kind == 2:
            arg = a0
        elif kind == 3:
            obj, arg = model_id(uc, ecx), a0
        elif kind == 4:
            obj = tree_id(uc, ecx)
            state['bs'] = a0
        elif kind == 5:
            state['bs'], arg = a0, a1
        elif kind == 6:
            arg = a0
        pending.append([kind, site(ret), obj, arg, 0, 0, esp, ret, ecx])

    def on_return(uc, addr, size, e):
        if rets[addr] == VSPLIT:
            return
        # A return site can also be reached as an ordinary branch target (a loop
        # header right after a call), so only a match with the innermost pending
        # call, with ESP back above its return address, counts as its return.
        if not pending or pending[-1][7] != addr or uc.reg_read(UC_X86_REG_ESP) <= pending[-1][6]:
            return
        row = pending.pop()
        if row[0] in (0, 1, 2, 4, 6):
            row[4] = uc.reg_read(UC_X86_REG_EAX)
            if row[0] == 4:
                row[4] = struct.unpack('<i', struct.pack('<I', row[4]))[0]
        row[5] = u32(uc, state['bs'] + 8) if state['bs'] else 0
        events.append(row[:6])
        if row[0] in (0, 1, 2, 5):
            # The arithmetic decoder's state after the call: low, range, value, bitsLeft.
            coder_state.append([len(events) - 1] + [u32(uc, row[8] + 4 * k) for k in range(4)])

    def on_raw32(uc, addr, size, e):
        events.append([RAW32, site(addr), -1, 32, uc.reg_read(UC_X86_REG_EBX), u32(uc, state['bs'] + 8)])

    def install(e):
        e.uc.hook_add(UC_HOOK_CODE, on_raw32, e, RAW32_SITE, RAW32_SITE)
        for a in list(KINDS) + [VSPLIT]:
            e.uc.hook_add(UC_HOOK_CODE, on_entry, e, a, a)
        for r in rets:
            e.uc.hook_add(UC_HOOK_CODE, on_return, e, r, r)
    probe.with_hooks(install)
    positions, faces = mts.Decoder(probe.DLL).decode_blob(blob)
    assert not pending, 'calls without returns: %r' % pending[:3]
    return {
        'tooth': tooth, 'which': which,
        'payloadBits': len([s for s in mts.streams(blob, 4).values() if s[0] == 'mesh'][0][2]) * 8,
        'events': events, 'coder': coder_state, 'sites': sites, 'models': models, 'trees': trees, 'splits': splits,
        'mesh': {
            'positions': [struct.unpack('<I', struct.pack('<f', v))[0] for v in positions.reshape(-1)],
            'faces': faces.reshape(-1).tolist(),
        },
    }


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-o')]
    out = next((a[2:] or None for a in sys.argv[1:] if a.startswith('-o')), None)
    tooth = int(args[0]) if args else 8
    which = args[1] if len(args) > 1 else 'crown'
    doc = record(tooth, which)
    out = out or 'oracle-%d-%s.json.gz' % (tooth, which)
    with gzip.open(out, 'wt') as fh:
        json.dump(doc, fh, separators=(',', ':'))
    kinds = {}
    for ev in doc['events']:
        kinds[ev[0]] = kinds.get(ev[0], 0) + 1
    print('%s: %d events %s, %d models, %d trees, %d splits, %d verts, last bit %d of %d -> %s (%d bytes)' % (
        '%d %s' % (tooth, which), len(doc['events']), kinds, len(doc['models']), len(doc['trees']),
        len(doc['splits']), len(doc['mesh']['positions']) // 3, doc['events'][-1][5], doc['payloadBits'],
        out, os.path.getsize(out)))
