/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import path from 'path'
import {buildSync} from 'esbuild'


/**
 * Import-graph guard for the session layer (design/tracks/open-t200/layering.md
 * §6, "The static guard"), as esbuild resolves it, like
 * engine/engineWorkerImports.test.js does for the worker.
 *
 * The session layer and everything below it are to run under Node with no
 * DOM (the headless test, which goes green with slice 3a). What stands in the
 * way is in the graph today: modelSession.js writes the store, and the store
 * reaches the UI's hash-state modules and `utils/location.js`, which assigns
 * `window.onhashchange` at import. So the graph is checked from the session's
 * own side: walking out from `session/index.js`, every edge that crosses into
 * the UI or the viewer, into React, MUI or zustand, or into one of the known
 * DOM-at-import modules, is an offender, and the offenders are asserted as an
 * EXACT set. A new one fails; so does one that has gone, so the slice that
 * removes an import deletes it from the list here.
 */
describe('session import graph', () => {
  const repoRoot = path.resolve(__dirname, '../..')

  /** @return {object} the metafile's inputs, repo-relative */
  function sessionInputs() {
    const result = buildSync({
      entryPoints: [path.join(repoRoot, 'src/session/index.js')],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: 'browser',
      logLevel: 'silent',
      // Conway is the engine and a dependency, checked by its own platform
      // tests (conway#540).
      external: ['@bldrs-ai/conway', '@bldrs-ai/conway/*'],
    })
    return result.metafile.inputs
  }

  /**
   * @param {string} input a metafile input path
   * @return {string|null} its npm package, or null for repo source
   */
  function packageOf(input) {
    const match = input.match(/.*node_modules\/((@[^/]+\/)?[^/]+)/)
    return match ? match[1] : null
  }

  const UI_PACKAGES = new Set(['react', 'react-dom', 'zustand'])
  // Below the viewer, these touch the DOM at import or on the load path
  // (layering.md §2.3).
  const DOM_OFFENDERS = new Set(['src/utils/location.js', 'src/utils/event.js'])

  /**
   * @param {string} input
   * @return {boolean} whether the session layer must not reach it
   */
  function isForbidden(input) {
    const pkg = packageOf(input)
    if (pkg !== null) {
      return UI_PACKAGES.has(pkg) || pkg.startsWith('@mui/')
    }
    return /^src\/(store|Components|Containers|viewer)\//.test(input) || input.endsWith('.jsx') ||
      DOM_OFFENDERS.has(input)
  }

  /** @return {Array<string>} `from -> to` for each edge out of the allowed graph */
  function offenders() {
    const inputs = sessionInputs()
    const seen = new Set()
    const found = new Set()
    const queue = ['src/session/index.js']
    while (queue.length > 0) {
      const from = queue.shift()
      if (seen.has(from)) {
        continue
      }
      seen.add(from)
      for (const {path: to} of inputs[from]?.imports ?? []) {
        if (isForbidden(to)) {
          found.add(`${from} -> ${to}`)
        } else {
          queue.push(to)
        }
      }
    }
    return [...found].sort()
  }

  it('reaches the session and its edit log, so the guard covers them', () => {
    expect(Object.keys(sessionInputs())).toEqual(expect.arrayContaining([
      'src/session/modelSession.js',
      'src/session/edit/editLog.js',
      'src/session/edit/editApply.js',
    ]))
  })

  it('crosses into the UI, the viewer or the DOM at exactly the known offenders', () => {
    // A new entry: the session layer gained a path up. Route it through an
    // injected callback (layering.md §4) instead. An entry that has gone:
    // delete it here, in the slice that removed it.
    expect(offenders()).toEqual([
      // The store, until slice 3a makes it a projection of session state.
      'src/session/modelSession.js -> src/store/IFCSlice.js',
      'src/session/modelSession.js -> src/store/useStore.js',
    ])
  })
})
