"""Measure Viewpoint's MetaStream decoder (Mts3Reader.dll) as it decodes ADF crowns.

Backs the numbers in design/new/adf-mts-decoder.md. Runs the DLL under the
Unicorn emulator from pablo-mayrgundter/freality `bio/med/dental/tools/mts/`
(emu.py, mts.py, adf.py), so it needs a checkout of that directory and the DLL
(sha256 a87b0712...; not redistributable, never commit it).

    export MTS_TOOLS=/path/to/freality/bio/med/dental/tools/mts
    export MTS_DLL=/path/to/Mts3Reader.dll
    python probe.py profile [tooth]   # per-function x86 instruction counts, call tree -> profile-<tooth>.json
    python probe.py census  [tooth]   # every entropy-decoder call site: counts, alphabets, ranges
    python probe.py fp                # all 54 blobs: does float32(i * scale + offset) in doubles match x87?
    python probe.py streams [tooth]   # which BitStream(s) the arithmetic and raw-bit reads consume
    python probe.py coder   [tooth]   # arithmetic-decoder state writes up to its first renormalization

ADF defaults to $MTS_TOOLS/../../PM.adf; override with $ADF. Tooth ids are
Align's (2-15 upper, 18-31 lower); the default, 8, is a small incisor.
Uses the same venv as tools/mts (requirements.txt), plus `capstone` for profile.
"""
import json
import os
import struct
import sys
from collections import defaultdict

TOOLS = os.environ.get('MTS_TOOLS')
DLL = os.environ.get('MTS_DLL')
if not TOOLS or not DLL:
    sys.exit('set MTS_TOOLS (freality bio/med/dental/tools/mts) and MTS_DLL (Mts3Reader.dll)')
sys.path.insert(0, TOOLS)
ADF = os.environ.get('ADF', os.path.join(TOOLS, '..', '..', 'PM.adf'))

import numpy as np  # noqa: E402
import adf  # noqa: E402
import mts  # noqa: E402
from emu import Emu, STUB  # noqa: E402
from unicorn import UC_HOOK_CODE, UC_HOOK_MEM_WRITE  # noqa: E402
from unicorn.x86_const import (  # noqa: E402
    UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_EIP, UC_X86_REG_ESI, UC_X86_REG_ESP,
)

# Entry points in Mts3Reader.dll 3.0.15.12 (see the spec's routine table).
ARITH_RENORM = 0x11822bd0
ARITH_SYMBOL = 0x11822ca0
ARITH_SYMBOL_BOUNDED = 0x11822d50
ARITH_UNIFORM = 0x11822d10
MODEL_UPDATE = 0x11822a70
RAW_TREE_INT = 0x118228f0
DEQUANT_IN = 0x118198a8   # first fild in the position plug-in
DEQUANT_OUT = 0x118198d9  # its ret, after the third fstp


def u32(uc, addr):
    return struct.unpack('<I', uc.mem_read(addr, 4))[0]


def blobs(tooth=None, initial=True):
    buf = open(ADF, 'rb').read()
    for _jaw, tid, crown, init in adf.teeth(adf.parse(buf)):
        if tooth is not None and tid != tooth:
            continue
        yield tid, 'crown', crown
        if initial and init is not None:
            yield tid, 'initial', init


def with_hooks(install):
    """Run every Emu the Decoder creates through `install(emu)`."""
    orig = Emu.__init__

    def patched(self, path):
        orig(self, path)
        install(self)
    Emu.__init__ = patched


def cmd_profile(tooth):
    import capstone
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
    cache = {}
    stats = defaultdict(lambda: {'n': 0, 'addrs': set(), 'fpu': defaultdict(int),
                                 'callees': defaultdict(int), 'calls': 0})
    inclusive = defaultdict(int)
    stack = [('<decode>', 0xffffffff, 0)]  # (fn, esp at entry, counter at entry)
    pending = [None]
    counter = [0]

    def hook(uc, addr, size, e):
        esp = uc.reg_read(UC_X86_REG_ESP)
        # A frame has returned once ESP is back above its return address. Unlike
        # matching ret instructions, this survives tail jumps.
        while len(stack) > 1 and esp > stack[-1][1]:
            fn, _, c0 = stack.pop()
            inclusive[fn] += counter[0] - c0
        if pending[0] is not None:
            caller, pending[0] = pending[0], None
            fn = 'import:%s' % e.py_stubs.get(addr, 'asm') if STUB <= addr < STUB + 0x10000 else '%#x' % addr
            stats[fn]['calls'] += 1
            stats[caller]['callees'][fn] += 1
            stack.append((fn, esp, counter[0]))
        counter[0] += 1
        cur = stack[-1][0]
        stats[cur]['n'] += 1
        if STUB <= addr < STUB + 0x10000:
            return
        i = cache.get(addr)
        if i is None:
            i = cache[addr] = next(md.disasm(bytes(uc.mem_read(addr, size)), addr))
        stats[cur]['addrs'].add(addr)
        if i.mnemonic.startswith('f'):
            stats[cur]['fpu'][i.mnemonic] += 1
        if i.mnemonic == 'call':
            pending[0] = cur

    # Only the decode itself: hook from the decoder's vtable entry, not DllMain/setup.
    armed = [False]

    def gate(uc, addr, size, e):
        if armed[0]:
            hook(uc, addr, size, e)

    def install(e):
        e.uc.hook_add(UC_HOOK_CODE, gate, e)
    with_hooks(install)
    dec = mts.Decoder(DLL)
    orig_call = Emu.call

    def call(self, fn, *args, this=None):
        try:
            armed[0] = bool(this) and fn == u32(self.uc, u32(self.uc, this) + mts.VT_DECODE_FROM)
        except Exception:  # `this` not constructed yet (e.g. the BitStream ctor call)
            armed[0] = False
        try:
            return orig_call(self, fn, *args, this=this)
        finally:
            armed[0] = False
    Emu.call = call
    for tid, kind, blob in blobs(tooth, initial=False):
        p, f = dec.decode_blob(blob)
    while stack:
        fn, _, c0 = stack.pop()
        inclusive[fn] += counter[0] - c0
    funcs = {fn: {'self': s['n'], 'inclusive': inclusive.get(fn, 0), 'static': len(s['addrs']),
                  'calls': s['calls'], 'fpu': dict(s['fpu']), 'callees': dict(s['callees'])}
             for fn, s in stats.items()}
    out = 'profile-%d.json' % tooth
    json.dump({'tooth': tooth, 'vertices': len(p), 'faces': len(f), 'functions': funcs}, open(out, 'w'), indent=1)
    real = [k for k in funcs if k.startswith('0x')]
    print('tooth %d: %d verts, %d faces; %d functions, %d distinct instructions, %d executed -> %s' % (
        tooth, len(p), len(f), len(real), sum(funcs[k]['static'] for k in real), counter[0], out))
    for fn, v in sorted(funcs.items(), key=lambda kv: -kv[1]['inclusive'])[:25]:
        print('  %-12s inclusive=%9d self=%9d static=%4d calls=%6d fpu=%d' % (
            fn, v['inclusive'], v['self'], v['static'], v['calls'], sum(v['fpu'].values())))


def cmd_census(tooth):
    kinds = {ARITH_SYMBOL: 'adaptiveSymbol', ARITH_SYMBOL_BOUNDED: 'adaptiveSymbolBounded',
             ARITH_UNIFORM: 'uniform', RAW_TREE_INT: 'rawBitsTreeInt', MODEL_UPDATE: 'modelUpdate'}
    census = defaultdict(lambda: {'n': 0, 'alphabet': set(), 'args': set()})

    def on(uc, addr, size, e):
        esp = uc.reg_read(UC_X86_REG_ESP)
        ret, arg0, ecx = u32(uc, esp), u32(uc, esp + 4), uc.reg_read(UC_X86_REG_ECX)
        c = census[(kinds[addr], ret)]
        c['n'] += 1
        if addr in (ARITH_SYMBOL, ARITH_SYMBOL_BOUNDED):
            c['alphabet'].add(u32(uc, arg0 + 4) - 1)
        elif addr == MODEL_UPDATE:
            c['alphabet'].add(u32(uc, ecx + 4) - 1)
        elif addr == ARITH_UNIFORM:
            c['args'].add(arg0)
        else:
            lo, hi = struct.unpack('<ii', uc.mem_read(ecx + 0x2c, 8))
            c['args'].add((lo, hi))

    with_hooks(lambda e: [e.uc.hook_add(UC_HOOK_CODE, on, e, a, a) for a in kinds])
    for tid, kind, blob in blobs(tooth, initial=False):
        p, f = mts.Decoder(DLL).decode_blob(blob)
        print('tooth %d %s: %d verts, %d faces' % (tid, kind, len(p), len(f)))
    for (k, ret), c in sorted(census.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        args = sorted(c['args'])
        print('  %-22s from %#x  n=%6d  alphabet=%s  %s' % (
            k, ret, c['n'], sorted(c['alphabet']) or '-', ('args=%s' % args[:13]) if args else ''))


def cmd_fp(_tooth):
    rows, outs = [], []

    def on_in(uc, addr, size, e):
        esi = uc.reg_read(UC_X86_REG_ESI)
        rows.append((struct.unpack('<3i', uc.mem_read(esi + 0x1d8, 12)),
                     struct.unpack('<3f', uc.mem_read(esi + 0x50, 12)),
                     struct.unpack('<3f', uc.mem_read(esi + 0x14, 12))))

    def on_out(uc, addr, size, e):
        outs.append(bytes(uc.mem_read(uc.reg_read(UC_X86_REG_EDX), 12)))

    with_hooks(lambda e: (e.uc.hook_add(UC_HOOK_CODE, on_in, e, DEQUANT_IN, DEQUANT_IN),
                          e.uc.hook_add(UC_HOOK_CODE, on_out, e, DEQUANT_OUT, DEQUANT_OUT)))
    dec = mts.Decoder(DLL)
    total = mismatches = max_int = n_blobs = 0
    for tid, kind, blob in blobs():
        rows.clear()
        outs.clear()
        dec.decode_blob(blob)
        n_blobs += 1
        for (ints, scale, off), got in zip(rows, outs):
            # JavaScript semantics: double multiply-add, then Math.fround.
            want = np.array([np.float64(i) * np.float64(s) + np.float64(o)
                             for i, s, o in zip(ints, scale, off)]).astype(np.float32).tobytes()
            total += 1
            mismatches += want != got
            max_int = max(max_int, *map(abs, ints))
    print('%d blobs, %d vertices, %d mismatches vs x87, max |quantized int| %d' % (n_blobs, total, mismatches, max_int))


def cmd_streams(tooth):
    seen = {}

    def track(kind, uc, bs):
        seen.setdefault((kind, bs), {})['lastBit'] = u32(uc, bs + 8)
        seen[(kind, bs)]['limitBits'] = u32(uc, bs + 0x10)

    def raw(uc, addr, size, e):
        track('raw', uc, u32(uc, uc.reg_read(UC_X86_REG_ESP) + 4))

    def arith(uc, addr, size, e):
        track('arith', uc, u32(uc, uc.reg_read(UC_X86_REG_ECX) + 0x10))

    with_hooks(lambda e: (e.uc.hook_add(UC_HOOK_CODE, raw, e, RAW_TREE_INT, RAW_TREE_INT),
                          e.uc.hook_add(UC_HOOK_CODE, arith, e, ARITH_RENORM, ARITH_RENORM)))
    for tid, kind, blob in blobs(tooth, initial=False):
        mts.Decoder(DLL).decode_blob(blob)
    for (kind, bs), v in seen.items():
        print('%-5s reads BitStream %#x, last bit %d of %d' % (kind, bs, v['lastBit'], v['limitBits']))


def cmd_coder(tooth):
    coder, writes, target = [], [], [None]
    renormed = [False]

    def on_renorm(uc, addr, size, e):
        if not coder:
            coder.append(uc.reg_read(UC_X86_REG_ECX))
        renormed[0] = True

    def on_write(uc, access, addr, size, value, e):
        if not renormed[0]:
            writes.append((uc.reg_read(UC_X86_REG_EIP), addr - target[0], value & 0xffffffff))

    def install(e):
        e.uc.hook_add(UC_HOOK_CODE, on_renorm, e, ARITH_RENORM, ARITH_RENORM)
        if target[0] is not None:
            e.uc.hook_add(UC_HOOK_MEM_WRITE, on_write, e, target[0], target[0] + 0x14)
    with_hooks(install)
    blob = next(blobs(tooth, initial=False))[2]
    mts.Decoder(DLL).decode_blob(blob)  # pass 1: find the coder (the emulator heap is deterministic)
    target[0] = coder.pop()
    renormed[0] = False
    mts.Decoder(DLL).decode_blob(blob)
    print('arithmetic decoder state at %#x; writes before the first renormalization:' % target[0])
    for eip, off, v in writes:
        print('  %#x  +%#04x = %#x' % (eip, off, v))


if __name__ == '__main__':
    cmds = {'profile': cmd_profile, 'census': cmd_census, 'fp': cmd_fp, 'streams': cmd_streams, 'coder': cmd_coder}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        sys.exit(__doc__)
    cmds[sys.argv[1]](int(sys.argv[2]) if len(sys.argv) > 2 else 8)
