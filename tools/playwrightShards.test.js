/* eslint-disable no-magic-numbers */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ANNOTATION_TITLE,
  FALLBACK_DEFAULT_SECONDS,
  annotationsFor,
  buildTimings,
  collectTests,
  countShardSeconds,
  diffPlanAgainstRun,
  escapeCommandData,
  main,
  measuredSeconds,
  parseArgs,
  parseTestList,
  payloadsFromAnnotations,
  planShards,
  unrepresentableKeys,
} from './playwrightShards.mjs'


/**
 * A Playwright JSON report in the shape `--list --reporter=json` and a real
 * run both produce: file suite -> describe suites -> specs -> tests.
 *
 * @param {object} files `{file: {describe: {title: [seconds|null, ...]}}}`:
 *   one spec per title; `null` seconds means "listed, not run".
 * @param {object} [opts] `{status}` for every test, default 'expected'.
 * @return {object}
 */
function report(files, {status = 'expected'} = {}) {
  return {
    config: {rootDir: '/nonexistent'},
    suites: Object.entries(files).map(([file, describes]) => ({
      title: file,
      file,
      specs: [],
      suites: Object.entries(describes).map(([describe, specs]) => ({
        title: describe,
        specs: Object.entries(specs).map(([title, seconds]) => ({
          title,
          file,
          tests: [{
            projectName: 'chromium',
            status,
            results: seconds === null ? [] : [{duration: seconds * 1000}],
          }],
        })),
      })),
    })),
  }
}


const key = (file, describe, title) => `[chromium] › ${file} › ${describe} › ${title}`


describe('playwrightShards', () => {
  describe('collectTests', () => {
    it('builds the exact --test-list line for each test', () => {
      const tests = collectTests(report({'a/b.spec.ts': {'Outer [desktop]': {'does it': 1}}}))
      expect(tests.map((t) => t.key)).toEqual([key('a/b.spec.ts', 'Outer [desktop]', 'does it')])
      expect(tests[0].file).toBe('a/b.spec.ts')
    })

    it('keeps nested describes in the title path', () => {
      const r = report({'a.spec.ts': {Outer: {t: 1}}})
      r.suites[0].suites[0].suites = [{title: 'Inner', specs: [{title: 'deep', file: 'a.spec.ts',
        tests: [{projectName: 'chromium', results: []}]}]}]
      expect(collectTests(r).map((t) => t.key)).toContain('[chromium] › a.spec.ts › Outer › Inner › deep')
    })
  })

  describe('unrepresentableKeys', () => {
    it('flags titles --test-list could not match', () => {
      const tests = collectTests(report({'a.spec.ts': {D: {'fine > ok': 1, 'bad › one': 1, ' padded': 1, 'two\nlines': 1}}}))
      expect(unrepresentableKeys(tests).sort()).toEqual([
        key('a.spec.ts', 'D', ' padded'),
        key('a.spec.ts', 'D', 'bad › one'),
        key('a.spec.ts', 'D', 'two\nlines'),
      ].sort())
    })
  })

  describe('planShards', () => {
    const tests = collectTests(report({'f.spec.ts': {D: {
      a: null, b: null, c: null, d: null, e: null, f: null,
    }}}))
    const timings = {defaultSeconds: 10, tests: {
      [key('f.spec.ts', 'D', 'a')]: 60,
      [key('f.spec.ts', 'D', 'b')]: 50,
      [key('f.spec.ts', 'D', 'c')]: 20,
      [key('f.spec.ts', 'D', 'd')]: 20,
      [key('f.spec.ts', 'D', 'e')]: 10,
      [key('f.spec.ts', 'D', 'f')]: 10,
    }}

    it('packs longest-first into the lightest shard', () => {
      const plan = planShards(tests, timings, {shards: 3})
      // a=60, b=50, c=20 open three shards; d joins c (40), e too (50), f joins b (60).
      expect(plan.shards.map((s) => s.seconds).sort((x, y) => x - y)).toEqual([50, 60, 60])
      expect(plan.unknown).toEqual([])
    })

    it('assigns every test to exactly one shard', () => {
      const plan = planShards(tests, timings, {shards: 4})
      const all = plan.shards.flatMap((s) => s.keys)
      expect(all.slice().sort()).toEqual(tests.map((t) => t.key).sort())
      expect(new Set(all).size).toBe(tests.length)
    })

    it('is deterministic and independent of input order', () => {
      const a = planShards(tests, timings, {shards: 4})
      const b = planShards(tests.slice().reverse(), timings, {shards: 4})
      expect(b.shards.map((s) => new Set(s.keys))).toEqual(a.shards.map((s) => new Set(s.keys)))
      expect(planShards(tests, timings, {shards: 4})).toEqual(a)
    })

    it('plans a test with no timing at the default, and says so', () => {
      const withNew = collectTests(report({'f.spec.ts': {D: {a: null, brandNew: null}}}))
      const plan = planShards(withNew, {defaultSeconds: 25, tests: {[key('f.spec.ts', 'D', 'a')]: 5}}, {shards: 2})
      expect(plan.unknown).toEqual([key('f.spec.ts', 'D', 'brandNew')])
      // The unknown test is heavier than `a`, so it lands alone, and still lands.
      expect(plan.shards.flatMap((s) => s.keys)).toHaveLength(2)
      expect(plan.shards.map((s) => s.seconds).sort((x, y) => x - y)).toEqual([5, 25])
    })

    it('still runs every test with an empty or missing timings file', () => {
      const plan = planShards(tests, {tests: {}}, {shards: 4})
      expect(plan.shards.flatMap((s) => s.keys)).toHaveLength(tests.length)
      expect(plan.defaultSeconds).toBe(FALLBACK_DEFAULT_SECONDS)
      expect(planShards(tests, null, {shards: 4}).unknown).toHaveLength(tests.length)
    })

    it('ignores timings for tests that no longer exist', () => {
      const stale = {tests: {...timings.tests, [key('gone.spec.ts', 'D', 'x')]: 999}}
      const plan = planShards(tests, stale, {shards: 2})
      expect(plan.shards.flatMap((s) => s.keys)).toHaveLength(tests.length)
      expect(plan.shards.reduce((sum, s) => sum + s.seconds, 0)).toBe(170)
    })

    it('keeps every test of an indivisible file in one shard', () => {
      const mixed = collectTests(report({
        'serial.spec.ts': {D: {s1: null, s2: null, s3: null}},
        'free.spec.ts': {D: {f1: null, f2: null}},
      }))
      const times = {tests: {}}
      for (const t of mixed) {
        times.tests[t.key] = 30
      }
      const plan = planShards(mixed, times, {shards: 3, isIndivisible: (file) => file === 'serial.spec.ts'})
      const homes = plan.shards.map((s) => s.keys.filter((k) => k.includes('serial.spec.ts')).length)
      expect(homes.filter((n) => n > 0)).toEqual([3])
    })

    it('rejects a bad shard count', () => {
      expect(() => planShards(tests, timings, {shards: 0})).toThrow(/positive integer/)
    })

    it('beats the by-count split when durations are skewed', () => {
      // 8 tests: the 4 slow ones are adjacent, as the export specs were.
      const skewed = collectTests(report({'f.spec.ts': {D: Object.fromEntries(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((t) => [t, null]))}}))
      const times = {tests: Object.fromEntries(skewed.map((t, i) => [t.key, i < 4 ? 60 : 5]))}
      const byCount = countShardSeconds(skewed, times, 4)
      expect(byCount).toEqual([120, 120, 10, 10])
      const planned = planShards(skewed, times, {shards: 4}).shards.map((s) => s.seconds)
      expect(Math.max(...planned)).toBeLessThan(Math.max(...byCount))
      expect(Math.max(...planned) - Math.min(...planned)).toBeLessThanOrEqual(5)
    })
  })

  describe('countShardSeconds', () => {
    it('mirrors Playwright: contiguous equal counts, the remainder to the first shards', () => {
      const ten = collectTests(report({'f.spec.ts': {D: Object.fromEntries(
        Array.from({length: 10}, (_, i) => [`t${i}`, null]))}}))
      const times = {tests: Object.fromEntries(ten.map((t) => [t.key, 1]))}
      // filterForShard: size 2, extra 2 -> shards of 3, 3, 2, 2 tests.
      expect(countShardSeconds(ten, times, 4)).toEqual([3, 3, 2, 2])
    })
  })

  describe('timings from run reports', () => {
    it('sums all attempts of a passing test and skips failures and skips', () => {
      const r = report({'f.spec.ts': {D: {ok: 4}}})
      const flaky = {projectName: 'chromium', status: 'flaky', results: [{duration: 9000}, {duration: 6000}]}
      const failed = {projectName: 'chromium', status: 'unexpected', results: [{duration: 30000}]}
      const skipped = {projectName: 'chromium', status: 'skipped', results: []}
      r.suites[0].suites[0].specs.push(
        {title: 'flaky', tests: [flaky]}, {title: 'failed', tests: [failed]}, {title: 'skipped', tests: [skipped]})
      const seconds = measuredSeconds(r)
      expect(seconds.get(key('f.spec.ts', 'D', 'ok'))).toBe(4)
      expect(seconds.get(key('f.spec.ts', 'D', 'flaky'))).toBe(15)
      expect(seconds.has(key('f.spec.ts', 'D', 'failed'))).toBe(false)
      expect(seconds.has(key('f.spec.ts', 'D', 'skipped'))).toBe(false)
    })

    it('takes the median over runs, so one slow runner does not move a test', () => {
      const runs = [10, 12, 40].map((s) => report({'f.spec.ts': {D: {t: s}}}))
      const timings = buildTimings(runs)
      expect(timings.tests[key('f.spec.ts', 'D', 't')]).toBe(12)
    })

    it('keeps unmeasured tests that still exist and drops ones that do not', () => {
      const previous = {tests: {[key('f.spec.ts', 'D', 'failedThisTime')]: 20, [key('f.spec.ts', 'D', 'deleted')]: 20}}
      const live = new Set([key('f.spec.ts', 'D', 'failedThisTime'), key('f.spec.ts', 'D', 't')])
      const timings = buildTimings([report({'f.spec.ts': {D: {t: 5}}})], {previous, liveKeys: live})
      expect(Object.keys(timings.tests).sort()).toEqual(
        [key('f.spec.ts', 'D', 'failedThisTime'), key('f.spec.ts', 'D', 't')].sort())
    })

    it('sets the default to the 90th percentile of measured costs and sorts keys', () => {
      const specs = Object.fromEntries(Array.from({length: 10}, (_, i) => [`t${String(i).padStart(2, '0')}`, (i + 1) * 3]))
      const timings = buildTimings([report({'f.spec.ts': {D: specs}})])
      expect(timings.defaultSeconds).toBe(27)
      const keys = Object.keys(timings.tests)
      expect(keys).toEqual(keys.slice().sort())
    })
  })

  describe('timing annotations', () => {
    // What the runner does with a `::notice` line: decode %25/%0D/%0A back.
    const decode = (line) => {
      const [, message] = line.match(/^::notice title=[^:]*::(.*)$/s)
      return message.replace(/%0A/g, '\n').replace(/%0D/g, '\r').replace(/%25/g, '%')
    }

    it('round-trips a shard report through annotation text and back into timings', () => {
      const r = report({'f.spec.ts': {D: {'100% sure': 12.34, 'plain': 5}}})
      const lines = annotationsFor(r, 3)
      expect(lines).toHaveLength(1)
      expect(lines[0]).not.toMatch(/\n/)
      const annotation = {title: `${ANNOTATION_TITLE} shard 3`, message: decode(lines[0])}
      const payloads = payloadsFromAnnotations([
        annotation,
        {title: 'other', message: '{}'},
        {title: ANNOTATION_TITLE, message: 'not json'},
      ])
      expect(payloads).toHaveLength(1)
      expect(payloads[0]).toMatchObject({shard: 3, chunk: 1, of: 1})
      const timings = buildTimings(payloads)
      expect(timings.tests[key('f.spec.ts', 'D', '100% sure')]).toBe(12.3)
      expect(timings.tests[key('f.spec.ts', 'D', 'plain')]).toBe(5)
    })

    it('keeps every annotation under the 4096-byte limit GitHub enforces, and recombines them', () => {
      // Incompressible-ish multi-byte titles: the worst case for the encoding.
      const specs = Object.fromEntries(Array.from({length: 600}, (_, i) =>
        [`› ${Math.random().toString(36).slice(2)} ${'é'.repeat(20)} ${i}`, 1]))
      const lines = annotationsFor(report({'f.spec.ts': {D: specs}}), 1)
      expect(lines.length).toBeGreaterThan(1)
      expect(lines.length).toBeLessThanOrEqual(10)
      for (const line of lines) {
        expect(Buffer.byteLength(line.slice(line.indexOf('::', 2) + 2))).toBeLessThan(4096)
      }
      const payloads = payloadsFromAnnotations(lines.map((l) => ({title: ANNOTATION_TITLE, message: decode(l)})))
      expect(payloads.flatMap((p) => p.seconds)).toHaveLength(600)
    })

    it('fits a realistic shard (100 long titles) in a few annotations', () => {
      const specs = Object.fromEntries(Array.from({length: 100}, (_, i) =>
        [`View 100: a long descriptive title about selecting things in a model number ${i}`, 12.3]))
      const lines = annotationsFor(report({'Components/Some/Area.spec.ts': {'Group [desktop]': specs}}), 2)
      expect(lines.length).toBeLessThanOrEqual(3)
    })

    it('refuses to drop timings when a shard would need more than 10 annotations', () => {
      const specs = Object.fromEntries(Array.from({length: 20000}, (_, i) =>
        [`${Math.random().toString(36)} ${Math.random().toString(36)} ${i}`, 1]))
      expect(() => annotationsFor(report({'f.spec.ts': {D: specs}}), 1)).toThrow(/per step/)
    })

    it('escapes the three characters the runner decodes', () => {
      expect(escapeCommandData('a%b\r\nc')).toBe('a%25b%0D%0Ac')
    })

    it('annotate command prints the workflow command lines', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwshards-'))
      const file = path.join(dir, 'r.json')
      fs.writeFileSync(file, JSON.stringify(report({'f.spec.ts': {D: {t: 2}}})))
      const chunks = []
      expect(main(['annotate', '--report', file, '--shard', '2'], {stdout: {write: (s) => chunks.push(s)}, env: {}})).toBe(0)
      expect(chunks.join('')).toMatch(/^::notice title=playwright-timings shard 2::/)
      fs.rmSync(dir, {recursive: true, force: true})
    })
  })

  describe('diffPlanAgainstRun', () => {
    const planned = [key('f.spec.ts', 'D', 'a'), key('f.spec.ts', 'D', 'b')]

    it('is clean when the run is exactly the plan', () => {
      expect(diffPlanAgainstRun(planned, report({'f.spec.ts': {D: {a: 1, b: 1}}}))).toEqual({missing: [], extra: []})
    })

    it('reports tests missing from the run and tests that were not planned', () => {
      expect(diffPlanAgainstRun(planned, report({'f.spec.ts': {D: {a: 1, c: 1}}}))).toEqual({
        missing: [key('f.spec.ts', 'D', 'b')],
        extra: [key('f.spec.ts', 'D', 'c')],
      })
    })
  })

  describe('parseTestList / parseArgs', () => {
    it('ignores blanks and comments', () => {
      expect(parseTestList('# note\n\n  a  \nb\n')).toEqual(['a', 'b'])
    })

    it('splits flags from positionals and rejects a flag with no value', () => {
      expect(parseArgs(['--out', 'x.json', 'r1.json', 'r2.json'])).toEqual({
        flags: {out: 'x.json'}, positional: ['r1.json', 'r2.json']})
      expect(() => parseArgs(['--out'])).toThrow(/needs a value/)
    })
  })

  describe('CLI', () => {
    let dir
    const sink = () => {
      const chunks = []
      return {write: (s) => chunks.push(s), text: () => chunks.join('')}
    }
    const write = (name, value) => {
      const file = path.join(dir, name)
      fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
      return file
    }

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwshards-'))
    })

    afterEach(() => {
      fs.rmSync(dir, {recursive: true, force: true})
    })

    it('plan -> verify: the four shard lists partition the suite and each verifies', () => {
      const titles = Object.fromEntries(Array.from({length: 9}, (_, i) => [`t${i}`, null]))
      const list = write('list.json', report({'a.spec.ts': {D: titles}}))
      const timings = write('timings.json', {defaultSeconds: 20, tests: {}})
      const seen = []
      for (let shard = 1; shard <= 4; shard++) {
        const out = path.join(dir, `shard${shard}.txt`)
        const stdout = sink()
        expect(main(['plan', '--list', list, '--shard', String(shard), '--of', '4', '--out', out, '--timings', timings],
          {stdout, env: {}})).toBe(0)
        expect(stdout.text()).toMatch(/9 test/)
        const keys = parseTestList(fs.readFileSync(out, 'utf8'))
        seen.push(...keys)
        const ran = {suites: report({'a.spec.ts': {D: Object.fromEntries(
          keys.map((k) => [k.split(' › ').pop(), 1]))}}).suites}
        const verifyOut = sink()
        expect(main(['verify', '--plan', out, '--report', write(`run${shard}.json`, ran)], {stdout: verifyOut, env: {}})).toBe(0)
      }
      expect(seen.sort()).toEqual(collectTests(JSON.parse(fs.readFileSync(list, 'utf8'))).map((t) => t.key).sort())
    })

    it('plan fails loudly on a title --test-list cannot carry', () => {
      const list = write('list.json', report({'a.spec.ts': {D: {'x › y': null}}}))
      const stdout = sink()
      expect(main(['plan', '--list', list, '--shard', '1', '--of', '4', '--out', path.join(dir, 'o.txt')],
        {stdout, env: {}})).toBe(1)
      expect(stdout.text()).toMatch(/cannot carry/)
    })

    it('plan fails on an empty list instead of running nothing', () => {
      const list = write('list.json', {suites: []})
      expect(main(['plan', '--list', list, '--shard', '1', '--of', '4', '--out', path.join(dir, 'o.txt')],
        {stdout: sink(), env: {}})).toBe(1)
    })

    it('plan keeps a serial spec file whole, read from the source', () => {
      const rootDir = path.join(dir, 'src')
      fs.mkdirSync(rootDir)
      fs.writeFileSync(path.join(rootDir, 'serial.spec.ts'), 'test.describe.configure({mode: \'serial\'})\n')
      fs.writeFileSync(path.join(rootDir, 'free.spec.ts'), '// nothing\n')
      const r = report({'serial.spec.ts': {D: {s1: null, s2: null, s3: null, s4: null}}, 'free.spec.ts': {D: {f1: null}}})
      r.config.rootDir = rootDir
      const list = write('list.json', r)
      const homes = []
      for (let shard = 1; shard <= 3; shard++) {
        const out = path.join(dir, `s${shard}.txt`)
        expect(main(['plan', '--list', list, '--shard', String(shard), '--of', '3', '--out', out], {stdout: sink(), env: {}})).toBe(0)
        homes.push(parseTestList(fs.readFileSync(out, 'utf8')).filter((k) => k.includes('serial.spec.ts')).length)
      }
      expect(homes.filter((n) => n > 0)).toEqual([4])
    })

    it('verify fails when a planned test did not run, and when there is no report', () => {
      const plan = write('plan.txt', `${key('a.spec.ts', 'D', 'x')}\n${key('a.spec.ts', 'D', 'y')}\n`)
      const run = write('run.json', report({'a.spec.ts': {D: {x: 1}}}))
      const stdout = sink()
      expect(main(['verify', '--plan', plan, '--report', run], {stdout, env: {}})).toBe(1)
      expect(stdout.text()).toMatch(/planned but not run \(1\)/)
      expect(main(['verify', '--plan', plan, '--report', path.join(dir, 'absent.json')], {stdout: sink(), env: {}})).toBe(1)
    })

    it('refresh writes timings that plan then uses', () => {
      const out = path.join(dir, 'timings.json')
      const run = write('run.json', report({'a.spec.ts': {D: {x: 8, y: 12}}}))
      expect(main(['refresh', '--out', out, run], {stdout: sink(), env: {}})).toBe(0)
      const timings = JSON.parse(fs.readFileSync(out, 'utf8'))
      expect(timings.tests[key('a.spec.ts', 'D', 'x')]).toBe(8)
      expect(timings.schema).toBe(1)
    })

    it('writes a markdown summary for the job page when asked', () => {
      const list = write('list.json', report({'a.spec.ts': {D: {x: null}}}))
      const summary = path.join(dir, 'summary.md')
      main(['plan', '--list', list, '--shard', '1', '--of', '2', '--out', path.join(dir, 'o.txt')],
        {stdout: sink(), env: {GITHUB_STEP_SUMMARY: summary}})
      expect(fs.readFileSync(summary, 'utf8')).toMatch(/Playwright shard 1 plan/)
    })
  })

  // The committed file is what every shard plans from; a hand-edit or a
  // bad refresh that broke it would otherwise surface as a CI-only failure.
  describe('committed timings file', () => {
    const file = path.join(path.dirname(new URL(import.meta.url).pathname), 'playwrightTimings.json')

    it('is well-formed', () => {
      const timings = JSON.parse(fs.readFileSync(file, 'utf8'))
      expect(timings.schema).toBe(1)
      expect(timings.defaultSeconds).toBeGreaterThan(0)
      const entries = Object.entries(timings.tests)
      expect(entries.length).toBeGreaterThan(0)
      for (const [k, seconds] of entries) {
        expect(k).toMatch(/^\[chromium\] › .+\.spec\.ts › /)
        expect(Number.isFinite(seconds) && seconds >= 0).toBe(true)
      }
    })
  })
})
