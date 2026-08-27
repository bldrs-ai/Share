import {processExternalUrl} from '../../routes/routes'
import {
  measureAllowHosts,
  modelBasenameOf,
  probeSource,
  toViewerUrl,
  urlMatchesModel,
  withFeatures,
} from './loadProbe'


/**
 * The two halves of the harness that a browser run cannot prove.
 *
 * - {@link probeSource} has to attach to the store *before* the first stage
 *   can open and close. That window is one task wide during app startup, so
 *   a real load either hits it or does not; only a fake store driven by hand
 *   makes it deterministic. Frames are stubbed out entirely here, which is
 *   what makes "before the first frame" expressible at all.
 * - {@link toViewerUrl} decides what Chromium navigates to. Getting it wrong
 *   for a hosted corpus model shows up in a browser run as a
 *   `waitForModelReady` timeout — indistinguishable from a slow model — so
 *   it is pinned here, and against Share's own route parser rather than
 *   against a hand-written expected string.
 */
describe('loadProbe', () => {
  describe('probeSource store attachment', () => {
    let pendingFrames = []
    let realRaf

    /**
     * Run every frame callback queued so far. `tick` re-arms itself, so the
     * queue is drained first and the re-arms are left for the next call.
     */
    function runFrames() {
      const due = pendingFrames
      pendingFrames = []
      for (const cb of due) {
        cb(1)
      }
    }

    /**
     * A stand-in for the zustand store `BaseRoutes.jsx` puts on
     * `window.store`, with a hand-driven `publish` in place of `set`.
     *
     * @return {object} the fake store
     */
    function fakeStore() {
      const listeners = []
      const state = {
        isModelReady: false,
        loadReportLines: [],
        currentLoadLine: null,
        viewer: null,
      }
      return {
        subscribeCount: 0,
        getState: () => state,
        subscribe(listener) {
          this.subscribeCount++
          listeners.push(listener)
          return () => {}
        },
        publish(patch) {
          Object.assign(state, patch)
          for (const listener of listeners.slice()) {
            listener(state)
          }
        },
      }
    }

    beforeEach(() => {
      pendingFrames = []
      realRaf = window.requestAnimationFrame
      window.requestAnimationFrame = (cb) => pendingFrames.push(cb)
    })

    afterEach(() => {
      window.requestAnimationFrame = realRaf
      delete window.store
      delete window.__bldrsLoadProbe
    })

    it('captures a stage that opens and closes before the first frame', () => {
      probeSource()
      // The frame loop is armed and has not run: everything below happens
      // in the startup window between `window.store = useStore` and the
      // next rAF, which is where a short stage lives and dies.
      expect(pendingFrames).toHaveLength(1)

      const store = fakeStore()
      window.store = store
      // conway's 74 ms `Parsing` stage: published, then replaced, with no
      // frame in between. Only the *second* label survives in getState().
      store.publish({currentLoadLine: 'Parsing [0%......56%] 0.074s'})
      store.publish({currentLoadLine: 'Writing [0%] 0.100s'})

      runFrames()

      expect(window.__bldrsLoadProbe.stageTransitions.map((t) => t.label))
        .toEqual(['Parsing', 'Writing'])
    })

    it('keeps recording stages once the frame loop is running', () => {
      probeSource()
      const store = fakeStore()
      window.store = store
      runFrames()
      store.publish({currentLoadLine: 'Opening model: 0.010s'})
      runFrames()
      store.publish({currentLoadLine: 'Geometry [0%] 0.200s'})

      expect(window.__bldrsLoadProbe.stageTransitions.map((t) => t.label))
        .toEqual(['Opening model', 'Geometry'])
      // The frame loop must not pile a second subscription on top of the
      // one the setter installed, or every stage would be recorded twice.
      expect(store.subscribeCount).toBe(1)
    })

    it('leaves window.store readable by the specs that use it', () => {
      // The attach point is an accessor over `window.store`. Several specs
      // (IfcIsolator, permalinkCamera, SynchronizedView) read that property
      // back, so the getter has to return exactly what was assigned.
      probeSource()
      const store = fakeStore()
      window.store = store
      expect(window.store).toBe(store)
    })
  })

  describe('measureAllowHosts', () => {
    it('names the hosted model\'s own host, and nothing else', () => {
      // What `homepageSetup`'s network guard is told to let through. The
      // guard denies raw.githubusercontent.com, so without this a
      // GitHub-hosted corpus model is aborted and the run dies as a
      // model-ready timeout — the same symptom a mis-routed URL produced.
      expect(measureAllowHosts('https://raw.githubusercontent.com/o/r/main/PSB.ifc'))
        .toEqual(['raw.githubusercontent.com'])
      expect(measureAllowHosts('https://media.githubusercontent.com/media/o/r/main/PSB.ifc'))
        .toEqual(['media.githubusercontent.com'])
    })

    it('allows nothing for a route', () => {
      // The default fixture run must leave the guard exactly as it was.
      expect(measureAllowHosts('/share/v/gh/bldrs-ai/test-models/main/ifc/x.ifc')).toEqual([])
    })
  })

  describe('model response matching', () => {
    it('matches a percent-encoded response URL for a spaced filename', () => {
      // conway's own smoke set carries `ISSUE_021_Mini Project.ifc`. The
      // basename decodes but `response.url()` does not, so comparing one
      // against the other never matches — and the failure is silent: no
      // response is collected, and `bytes.model` plus every download timing
      // come back null on a model that loaded fine.
      const modelUrl = 'https://models.example.com/corpus/ISSUE_021_Mini Project.ifc'
      const basename = modelBasenameOf(modelUrl)
      expect(basename).toBe('ISSUE_021_Mini Project.ifc')
      expect(urlMatchesModel(
        'https://models.example.com/corpus/ISSUE_021_Mini%20Project.ifc', basename)).toBe(true)
    })

    it('matches when the caller supplied the encoded form', () => {
      const basename = modelBasenameOf('https://models.example.com/c/Assembly%20A.ifc')
      expect(basename).toBe('Assembly A.ifc')
      expect(urlMatchesModel('https://models.example.com/c/Assembly%20A.ifc', basename)).toBe(true)
      expect(urlMatchesModel('https://models.example.com/c/Assembly A.ifc', basename)).toBe(true)
    })

    it('still ignores an unrelated response, and a URL with no basename', () => {
      const basename = modelBasenameOf('https://models.example.com/c/Assembly%20A.ifc')
      expect(urlMatchesModel('https://models.example.com/c/other.ifc', basename)).toBe(false)
      // A bare `%` is legal in a URL and must not throw the decode.
      expect(urlMatchesModel('https://models.example.com/c/100%discount', basename)).toBe(false)
      expect(urlMatchesModel('https://models.example.com/c/x.ifc', '')).toBe(false)
    })

    it('strips a query and a fragment before taking the basename', () => {
      expect(modelBasenameOf('https://storage.example.com/DOWA.ifc?token=abc&expires=1'))
        .toBe('DOWA.ifc')
    })
  })

  describe('toViewerUrl', () => {
    it('leaves a Share viewer route alone', () => {
      const route = '/share/v/gh/bldrs-ai/test-models/main/ifc/openifcmodels/x.ifc'
      expect(toViewerUrl(route)).toBe(route)
    })

    it('leaves an absolute Share viewer URL alone', () => {
      const preview = 'https://deploy-preview-1774--bldrs-share.netlify.app/share/v/gh/o/r/main/x.ifc'
      expect(toViewerUrl(preview)).toBe(preview)
      // The GitHub-Pages install prefix doubles the `share` segment.
      const pages = 'https://bldrs-ai.github.io/Share/share/v/p/index.ifc'
      expect(toViewerUrl(pages)).toBe(pages)
      // Already wrapped, pointed at another deployment on purpose.
      const wrapped = 'https://bldrs.ai/share/v/u/https%3A%2F%2Fhost%2FPSB.ifc'
      expect(toViewerUrl(wrapped)).toBe(wrapped)
    })

    it('routes a hosted model URL through the viewer, recoverably', () => {
      // The failure this replaces was a `page.goto` straight at the IFC
      // bytes, which times out in `waitForModelReady` and reads like a slow
      // model. Asserted through Share's own `/v/u` handler, so the wrap is
      // pinned to what the app will do with it, not to a string.
      const hosted = 'https://models.example.com/corpus/PSB.ifc'
      const viewerUrl = toViewerUrl(hosted)
      expect(viewerUrl.startsWith('/share/v/u/')).toBe(true)
      expect(splatDownloadUrl(viewerUrl)).toBe(hosted)
    })

    it('keeps a signed model URL query out of the viewer query', () => {
      // Corpus models are commonly served from signed storage URLs. The
      // percent-encoding is what keeps that `?` inside the splat segment
      // rather than merging with the `?feature=` withFeatures appends.
      const signed = 'https://storage.example.com/DOWA.ifc?token=abc&expires=1'
      const withFlags = withFeatures(toViewerUrl(signed), ['conwayDirectIfc'])
      expect(withFlags.endsWith('?feature=conwayDirectIfc')).toBe(true)
      expect(splatDownloadUrl(withFlags.split('?feature=')[0])).toBe(signed)
    })
  })
})


/**
 * What Share resolves a `/share/v/u/<encoded>` URL down to, following the
 * same path the app does: react-router decodes the splat, then
 * `processExternalUrl` turns it into a download URL.
 *
 * @param {string} viewerUrl a `/share/v/u/...` path
 * @return {string} the download URL the viewer would fetch
 */
function splatDownloadUrl(viewerUrl) {
  const prefix = '/share/v/u/'
  const splat = decodeURIComponent(viewerUrl.slice(prefix.length))
  const result = processExternalUrl(new URL(`http://bldrs.test${viewerUrl}`), splat)
  return result.downloadUrl.toString()
}
