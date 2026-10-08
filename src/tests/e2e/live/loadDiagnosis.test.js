import {
  OPFS_FALLBACK_NEEDLE,
  READER_GRACE_MS,
  artifactVerdict,
  describeArtifactFailure,
  describeModelNotReady,
  describeNavigationFailure,
  opfsSkipReason,
  pushDiagnostic,
  redactDiagnostic,
  webglSkipReason,
} from './loadDiagnosis'


/* eslint-disable no-magic-numbers */
const TIMEOUT = 90_000
const base = {glbLines: [], diagnostics: [], appOpfs: true, elapsedMs: 0, timeoutMs: TIMEOUT}
const MISS = '[glb] reader: local cache MISS, will export after parse'


describe('live/loadDiagnosis', () => {
  describe('artifactVerdict', () => {
    it('is done once the writer wrote', () => {
      expect(artifactVerdict({...base, glbLines: [MISS, '[glb] writer: wrote 5765B (1 chunk) to x.glb in 2209ms']}))
        .toEqual({state: 'done'})
    })

    it('waits while the reader has run and the writer has not finished', () => {
      expect(artifactVerdict({...base, glbLines: [MISS], elapsedMs: TIMEOUT - 1})).toEqual({state: 'pending'})
    })

    it('gives the reader line a grace period before calling it missing', () => {
      expect(artifactVerdict({...base, elapsedMs: READER_GRACE_MS - 1})).toEqual({state: 'pending'})
    })

    // #1942's first WebKit run: model ready, zero [glb] lines, a 90s wait.
    it('fails early, not at the timeout, when the reader never ran', () => {
      const verdict = artifactVerdict({...base, elapsedMs: READER_GRACE_MS})
      expect(verdict.state).toBe('failed')
      expect(verdict.reason).toContain('GLB reader never ran')
    })

    it('fails at once when the app found no OPFS', () => {
      const verdict = artifactVerdict({...base, appOpfs: false})
      expect(verdict.state).toBe('failed')
      expect(verdict.reason).toContain('isOpfsAvailable === false')
    })

    it('does not treat an unknown or unexposed OPFS verdict as absent', () => {
      expect(artifactVerdict({...base, appOpfs: null, glbLines: [MISS]})).toEqual({state: 'pending'})
      expect(artifactVerdict({...base, appOpfs: undefined, glbLines: [MISS]})).toEqual({state: 'pending'})
    })

    it('fails at once, quoting the warning, when the loader fell back from OPFS', () => {
      const warning = `console.warning: Loader#load: ${OPFS_FALLBACK_NEEDLE} (InvalidStateError); falling back`
      const verdict = artifactVerdict({...base, diagnostics: ['console.error: unrelated', warning]})
      expect(verdict.state).toBe('failed')
      expect(verdict.reason).toContain(warning)
    })

    it('fails at once, quoting it, when the writer skipped', () => {
      const skipped = '[glb] writer: skipped (threw); reader will fall back to source on next load: TypeError'
      const verdict = artifactVerdict({...base, glbLines: [MISS, skipped]})
      expect(verdict).toEqual({state: 'failed', reason: `the GLB writer gave up on this load: ${skipped}`})
    })

    it('fails at once when the cache lookup threw, since no writer context is built', () => {
      const failed = '[glb] reader: local cache lookup failed; treating as MISS and continuing: Error'
      expect(artifactVerdict({...base, glbLines: [failed]}).state).toBe('failed')
    })

    it('fails at the timeout otherwise', () => {
      expect(artifactVerdict({...base, glbLines: [MISS], elapsedMs: TIMEOUT}).state).toBe('failed')
    })
  })

  describe('describeArtifactFailure', () => {
    it('prints the reason, the OPFS probe, the [glb] lines and the diagnostics', () => {
      const text = describeArtifactFailure('the reader never ran', {
        glbLines: [],
        opfs: {app: true, directory: 'ok', syncWrite: 'UnknownError: The operation failed'},
        diagnostics: ['pageerror: Error: boom'],
      })
      expect(text).toContain('No GLB artifact: the reader never ran.')
      expect(text).toContain('app isOpfsAvailable: true')
      expect(text).toContain('createSyncAccessHandle() write: UnknownError: The operation failed')
      expect(text).toContain('[glb] lines captured:\n  (none)')
      expect(text).toContain('  pageerror: Error: boom')
    })

    it('says so when the page could not be read or the store is not exposed', () => {
      expect(describeArtifactFailure('x', {glbLines: [], opfs: null, diagnostics: []}))
        .toContain('(the page could not be read)')
      expect(describeArtifactFailure('x', {glbLines: [], opfs: {app: undefined, directory: 'ok', syncWrite: 'ok'}, diagnostics: []}))
        .toContain('(store not exposed)')
    })
  })

  describe('describeModelNotReady', () => {
    const render = {url: 'https://x/share/v/p/index.ifc', hasDropzone: false, modelReady: null, bodyText: '', webgl2: 'none'}

    it('names a crash when the ErrorBoundary fallback is showing', () => {
      const text = describeModelNotReady(
        {...render, bodyText: 'Oh no!\nWe\'re not quite sure what went wrong.'}, ['pageerror: Error: Error creating WebGL context.'])
      expect(text).toContain('The app crashed')
      expect(text).toContain('WebGL2: none')
      expect(text).toContain('Error creating WebGL context.')
    })

    it('tells a missing dropzone from a load that did not finish', () => {
      expect(describeModelNotReady(render, [])).toContain('cadview-dropzone is not in the DOM')
      expect(describeModelNotReady({...render, hasDropzone: true, modelReady: 'false'}, []))
        .toContain('data-model-ready=false: the load itself did not finish')
    })
  })

  describe('opfsSkipReason', () => {
    it('skips webkit and firefox when the page has no getDirectory, naming the engine', () => {
      for (const engine of ['webkit', 'firefox']) {
        const reason = opfsSkipReason({engine, hasGetDirectory: false})
        expect(reason).toContain(`${engine}: no navigator.storage in this Playwright build`)
        expect(reason).toContain('covered on chromium')
        expect(reason).toContain('manual Safari check (§8 step 7)')
      }
    })

    it('never skips chromium: no OPFS there is a regression and must fail', () => {
      expect(opfsSkipReason({engine: 'chromium', hasGetDirectory: false})).toBeNull()
    })

    it('does not skip an engine it cannot name, so a harness gap fails loudly', () => {
      expect(opfsSkipReason({engine: 'unknown', hasGetDirectory: false})).toBeNull()
    })

    it('does not skip an engine that has OPFS, so a real write failure still fails', () => {
      for (const engine of ['chromium', 'webkit', 'firefox']) {
        expect(opfsSkipReason({engine, hasGetDirectory: true})).toBeNull()
      }
    })
  })

  describe('webglSkipReason', () => {
    it('skips firefox and webkit without WebGL2, naming the engine and both issues', () => {
      for (const engine of ['firefox', 'webkit']) {
        const reason = webglSkipReason({engine, hasWebGL2: false})
        expect(reason).toContain(`${engine}: no WebGL2 in this Playwright build`)
        expect(reason).toContain('#659')
        expect(reason).toContain('#1947')
      }
    })

    it('never skips chromium: no WebGL there is a regression and must fail', () => {
      expect(webglSkipReason({engine: 'chromium', hasWebGL2: false})).toBeNull()
    })

    it('does not skip an engine it cannot name, so a harness gap fails loudly', () => {
      expect(webglSkipReason({engine: 'unknown', hasWebGL2: false})).toBeNull()
    })

    it('does not skip an engine that has WebGL2, so a real crash still fails', () => {
      for (const engine of ['chromium', 'webkit', 'firefox']) {
        expect(webglSkipReason({engine, hasWebGL2: true})).toBeNull()
      }
    })
  })

  describe('describeNavigationFailure', () => {
    const NAV = 'page.goto: net::ERR_ABORTED; maybe frame was detached?'

    it('says no response ever came, and that the app never ran, when the document request was pending', () => {
      const text = describeNavigationFailure(NAV, {status: null, failure: null, pendingMs: 60_000, timeoutMs: 60_000})
      expect(text).toContain(NAV)
      expect(text).toContain('no response')
      expect(text).toContain('60s')
      expect(text).toContain('app never started')
    })

    it('reports the status when the document answered but never reached DOMContentLoaded', () => {
      const text = describeNavigationFailure(NAV, {status: 200, failure: null, pendingMs: 60_000, timeoutMs: 60_000})
      expect(text).toContain('HTTP 200')
      expect(text).toContain('DOMContentLoaded')
    })

    it('reports the network failure when the document request itself failed', () => {
      const text = describeNavigationFailure(NAV, {status: null, failure: 'net::ERR_CONNECTION_RESET', pendingMs: 3_000, timeoutMs: 60_000})
      expect(text).toContain('net::ERR_CONNECTION_RESET')
    })
  })

  describe('redactDiagnostic', () => {
    it('removes JWTs and bearer tokens', () => {
      const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl'
      const line = redactDiagnostic(`failed: ${jwt} Authorization: Bearer abc.def access_token=secret123&x=1`)
      expect(line).not.toContain(jwt)
      expect(line).not.toContain('abc.def')
      expect(line).not.toContain('secret123')
      expect(line).toContain('<jwt>')
    })

    it('caps a long line', () => {
      expect(redactDiagnostic('a'.repeat(1000)).length).toBeLessThan(500)
    })
  })

  describe('pushDiagnostic', () => {
    it('keeps the first lines and drops the rest', () => {
      const buffer = []
      for (let i = 0; i < 100; i++) {
        pushDiagnostic(buffer, `line ${i}`)
      }
      expect(buffer[0]).toBe('line 0')
      expect(buffer.length).toBeLessThan(100)
    })

    it('drops the engine\'s own GL chatter, which would crowd out the error', () => {
      const buffer = []
      pushDiagnostic(buffer, 'console.warning: [.WebGL-0x1]GL Driver Message (OpenGL, Performance): GPU stall due to ReadPixels')
      pushDiagnostic(buffer, 'pageerror: Error: Error creating WebGL context.')
      expect(buffer).toEqual(['pageerror: Error: Error creating WebGL context.'])
    })
  })
})
