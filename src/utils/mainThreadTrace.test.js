/* eslint-disable no-magic-numbers */
import {
  compactLoaf, hiddenPeriods, loadWindow, markWindow, percentile, replayBlocks, sanitizeInvoker, sourceBasename,
  summarizeWindow, topScripts,
} from './mainThreadTrace'


describe('utils/mainThreadTrace', () => {
  describe('percentile', () => {
    it('is nearest-rank, and null when empty', () => {
      expect(percentile([], 50)).toBeNull()
      expect(percentile([5, 1, 3], 50)).toBe(3)
      expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10)
      expect(percentile([1, 2, 3, 4], 0)).toBe(1)
    })
  })

  describe('privacy of script attribution', () => {
    it('keeps an invoker name but never a URL', () => {
      expect(sanitizeInvoker('Window.setTimeout')).toBe('Window.setTimeout')
      expect(sanitizeInvoker('https://bldrs.ai/share/v/gh/org/repo/main/private.ifc')).toBe('(url)')
      expect(sanitizeInvoker('blob:https://bldrs.ai/abc')).toBe('(url)')
      expect(sanitizeInvoker(undefined)).toBe('')
    })

    it('keeps only a source file\'s basename', () => {
      expect(sourceBasename('https://bldrs.ai/static/js/index.js?v=3#x')).toBe('index.js')
      expect(sourceBasename('')).toBe('')
    })
  })

  describe('compactLoaf', () => {
    it('splits a long frame into the work before rendering and the rendering', () => {
      const f = compactLoaf({
        startTime: 1000, duration: 120, renderStart: 1090, blockingDuration: 70,
        scripts: [{startTime: 1000, duration: 85, invokerType: 'user-callback', invoker: 'Window.setTimeout',
          sourceFunctionName: 'assembleBatchedModel', sourceURL: 'https://bldrs.ai/index.js?x=1'}],
      })
      expect(f).toMatchObject({t: 1000, d: 120, nonRender: 90, render: 30, blocking: 70})
      expect(f.scripts[0]).toEqual({t: 1000, d: 85, type: 'user-callback', invoker: 'Window.setTimeout',
        fn: 'assembleBatchedModel', file: 'index.js'})
    })

    it('counts a frame with no rendering as all non-render work', () => {
      expect(compactLoaf({startTime: 10, duration: 200, renderStart: 0}).nonRender).toBe(200)
    })
  })

  describe('replayBlocks', () => {
    const trace = {
      stoppedAt: 10000,
      loaf: [
        {t: 1000, d: 120, nonRender: 90, render: 30, scripts: []},
        {t: 2000, d: 40, nonRender: 10, render: 30, scripts: []}, // render-only: not replayed
        {t: 5000, d: 300, nonRender: 300, render: 0, scripts: []},
      ],
      longTasks: [{t: 1000, d: 120}],
    }

    it('replays only the non-render part of long frames in the window, relative to its start', () => {
      expect(replayBlocks(trace, {from: 500, to: 6000})).toEqual({
        source: 'loaf', span: 5500, blocks: [{t: 500, d: 90}, {t: 4500, d: 300}],
      })
    })

    it('falls back to long tasks when the trace has no long frames', () => {
      const plan = replayBlocks({...trace, loaf: []})
      expect(plan.source).toBe('longtask')
      expect(plan.blocks).toEqual([{t: 1000, d: 120}])
    })
  })

  describe('loadWindow', () => {
    it('spans the first load start to the load end after it', () => {
      const trace = {stoppedAt: 9000, events: [{t: 50, name: 'loadEnd'}, {t: 100, name: 'loadStart'},
        {t: 4000, name: 'firstMesh'}, {t: 7000, name: 'loadEnd'}]}
      expect(loadWindow(trace)).toEqual({from: 100, to: 7000, label: 'load'})
    })

    it('is the whole trace when no load was seen', () => {
      expect(loadWindow({stoppedAt: 9000, events: []})).toEqual({from: 0, to: 9000, label: 'whole trace'})
    })
  })

  describe('summarizeWindow', () => {
    it('reports frame cadence, stalls, main-thread work and drag delay inside the window only', () => {
      const trace = {
        frames: [0, 16, 32, 132, 148, 2000],
        loaf: [{t: 40, d: 100, nonRender: 90, render: 10, scripts: [{d: 80, type: 'user-callback', fn: 'build', file: 'i.js'}]}],
        longTasks: [{t: 40, d: 100}],
        inputs: [{t: 50, name: 'pointermove', delay: 80}, {t: 60, name: 'pointerdown', delay: 70}],
      }
      const s = summarizeWindow(trace, {from: 0, to: 1000})
      expect(s.frames).toBe(5)
      expect(s.frameIntervalMs).toEqual({p50: 16, p95: 100, max: 100, over50: 1, hiddenGaps: 0})
      expect(s.loaf).toEqual({count: 1, nonRenderMs: 90, renderMs: 10, maxNonRenderMs: 90})
      expect(s.longTasks).toEqual({count: 1, totalMs: 100, maxMs: 100})
      expect(s.pointermoveDelayMs).toMatchObject({n: 1, p50: 80})
      expect(s.discreteInputDelayMs).toEqual({n: 1, p95: 70})
      expect(s.topScripts).toEqual([{key: 'user-callback · build · i.js', ms: 80, count: 1}])
    })
  })

  describe('hidden tab', () => {
    const trace = {
      stoppedAt: 10000,
      frames: [0, 16, 32, 6032, 6048],
      events: [{t: 40, name: 'hidden'}, {t: 6000, name: 'visible'}, {t: 9000, name: 'hidden'}],
    }

    it('turns hidden/visible events into spans, an open one running to the end', () => {
      expect(hiddenPeriods(trace)).toEqual([[40, 6000], [9000, 10000]])
    })

    it('leaves out a frame gap the tab spent hidden, instead of calling it a stall', () => {
      const s = summarizeWindow(trace, {from: 0, to: 10000})
      expect(s.frameIntervalMs).toEqual({p50: 16, p95: 16, max: 16, over50: 0, hiddenGaps: 1})
      // Without the events, the same frames read as a 6 s stall.
      expect(summarizeWindow({...trace, events: []}, {from: 0, to: 10000}).frameIntervalMs.max).toBe(6000)
    })
  })

  it('markWindow spans the first to the last Mark, or is null without two', () => {
    expect(markWindow({events: [{t: 5, name: 'mark'}, {t: 9, name: 'loadEnd'}, {t: 20, name: 'mark'}]}))
      .toEqual({from: 5, to: 20, label: 'between marks'})
    expect(markWindow({events: [{t: 5, name: 'mark'}]})).toBeNull()
  })

  it('topScripts ranks attribution by total time', () => {
    const loaf = [{scripts: [{d: 10, type: 'a', fn: 'x'}, {d: 30, type: 'b', fn: 'y'}]}, {scripts: [{d: 15, type: 'a', fn: 'x'}]}]
    expect(topScripts(loaf, 1)).toEqual([{key: 'b · y', ms: 30, count: 1}])
  })
})
