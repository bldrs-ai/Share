import React from 'react'
import {render, screen} from '@testing-library/react'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {MockComponent} from './__mocks__/MockComponent'
import MockRoutes from './BaseRoutesMock.test'
import useStore from './store/useStore'
import {UNSUPPORTED_FILE_ALERT, processFile} from './routes/routes'
import {processGoogleFileId} from './routes/google'
import {actAsyncFlush} from './utils/tests'
// Slice 5d.4: Share renders the app, which loads ShareViewer (→
// IfcContext / ShareIfc). ShareViewer no longer self-imports the fork to
// trigger the Jest harness, so load it explicitly before `./Share` so
// the harness's dep mocks register first.
import '../__mocks__/shareViewerTestHarness'
import Share from './Share'


test('Share renders without crashing', () => {
  // This test verifies that the Share component can render without throwing errors
  // The main fix was updating pathPrefix checks to work without leading '/'
  const {container} = render(
    <MockComponent>
      <MockRoutes
        contentElt={
          <Share
            installPrefix='/'
            appPrefix='share'
            pathPrefix='share/v/p'
          />}
      />
    </MockComponent>)
  // Just verify the component renders (container exists)
  expect(container).toBeTruthy()
})


/**
 * Regression cover for SHARE-1H4. Route parsing throws FilenameParseError
 * for a path that names no supported model file, and Share calls it from
 * inside an effect — so the throw reached the ErrorBoundary and the app went
 * down for what is really just a bad link. Both shapes below came from real
 * GitHub URLs in that issue.
 */
describe('Share with an unsupported model path', () => {
  /**
   * @param {string} filepath The splat under /share/v/gh/:org/:repo/:branch
   */
  function renderGithubRoute(filepath) {
    render(
      <MockComponent>
        <MemoryRouter initialEntries={[`/share/v/gh/bldrs-ai/test-repo/main/${filepath}`]}>
          <Routes>
            <Route
              path='/share/v/gh/:org/:repo/:branch/*'
              element={
                <Share
                  installPrefix=''
                  appPrefix='/share'
                  pathPrefix='/share/v/gh'
                />}
            />
            {/* navToDefault's destination. Declared so react-router doesn't
                warn about an unmatched location on the fallback redirect;
                nothing needs to render there. */}
            <Route path='/share/v/p/*' element={<div data-testid='home-model'/>}/>
          </Routes>
        </MemoryRouter>
      </MockComponent>)
  }

  // Reset before rather than after each case: nothing is mounted yet at this
  // point, so the store write can't re-render a live subscriber outside
  // act() (PLAYBOOK.md §"Keep the test console clean").
  beforeEach(() => {
    useStore.setState({alert: null, repository: null})
  })

  it('alerts rather than crashing on an unrecognized extension', () => {
    renderGithubRoute('Jetenginestep.st')
    expect(useStore.getState().alert).toBe(UNSUPPORTED_FILE_ALERT)
    // ...and falls back to the home model, as an unusable route already did.
    expect(screen.getByTestId('home-model')).toBeInTheDocument()
  })

  it('alerts rather than crashing on a bare directory path', () => {
    renderGithubRoute('models/parts')
    expect(useStore.getState().alert).toBe(UNSUPPORTED_FILE_ALERT)
  })

  /**
   * The effect must stop on the handled-error path, not fall through to the
   * repository block — those are the very params that just failed to parse,
   * so configuring a repository from them flashes a bogus org/repo on the way
   * to the fallback.
   */
  it('does not configure a repository from the params that failed to parse', () => {
    renderGithubRoute('Jetenginestep.st')
    expect(useStore.getState().repository).toBe(null)
  })
})


/**
 * #705: a file opened from the user's computer keeps its Share button, so
 * ShareControl can show it gated with the reason. It used to be hidden here
 * (`isShareEnabled` false), which told the user nothing.
 */
describe('Share for a local upload route', () => {
  // Seeded false so the assertion can't pass on the slice's default (true).
  beforeEach(() => {
    useStore.setState({modelPath: null, repository: null, isShareEnabled: false, isNotesEnabled: true})
  })

  it('shows the Share button, with upload provenance for ShareControl to gate on', async () => {
    render(
      <MockComponent>
        <MemoryRouter initialEntries={['/share/v/new/12345678-1234-4abc-9def-123456789abc.ifc']}>
          <Routes>
            <Route
              path='/share/v/new/*'
              element={<Share installPrefix='' appPrefix='/share' pathPrefix='/share/v/new'/>}
            />
          </Routes>
        </MemoryRouter>
      </MockComponent>)
    // The route mounts CadView, whose viewer setup settles after the first
    // render; flush it inside act() so it doesn't land as a stray update.
    await actAsyncFlush()
    expect(useStore.getState().isShareEnabled).toBe(true)
    expect(useStore.getState().modelPath.isUploadedFile).toBe(true)
    // Unchanged: still no repository, so no notes.
    expect(useStore.getState().repository).toBe(null)
    expect(useStore.getState().isNotesEnabled).toBe(false)
  })
})


/**
 * `/share/v/new/<id>` and `/share/v/p/<id>` parse to the same filepath and no
 * gitpath. modelPath lives in the store, so moving between them must replace
 * it, or the upload provenance CadView hands the loader (`isUploadedRoute`)
 * is the previous route's (#1955, codex review on #1956).
 */
describe('Share when only the upload provenance of the route changes', () => {
  const storageId = '12345678-1234-4abc-9def-123456789abc.ifc'

  // Before mount, for the same act() reason as above.
  beforeEach(() => {
    useStore.setState({alert: null, modelPath: null})
  })

  /**
   * @param {string} prefix '/share/v/p' or '/share/v/new'
   */
  function renderFileRoute(prefix) {
    render(
      <MockComponent>
        <MemoryRouter initialEntries={[`${prefix}/${storageId}`]}>
          <Routes>
            <Route
              path={`${prefix}/*`}
              element={<Share installPrefix='' appPrefix='/share' pathPrefix={prefix}/>}
            />
          </Routes>
        </MemoryRouter>
      </MockComponent>)
  }

  it('replaces an upload modelPath when the same file is opened as hosted', () => {
    // What /share/v/new/<id> left in the store.
    useStore.setState({modelPath: {filepath: storageId, isUploadedFile: true}})
    renderFileRoute('/share/v/p')
    expect(useStore.getState().modelPath.filepath).toBe(storageId)
    expect(useStore.getState().modelPath.isUploadedFile).toBe(false)
  })

  it('replaces a hosted modelPath when the same file is opened as an upload', () => {
    useStore.setState({modelPath: {filepath: storageId, isUploadedFile: false}})
    renderFileRoute('/share/v/new')
    expect(useStore.getState().modelPath.isUploadedFile).toBe(true)
  })
})


/**
 * open-205 #2013: "a different model" is `modelIdentity` plus the route's
 * provenance, not a comparison of `filepath`/`gitpath`. Drive and generic-URL
 * routes carry neither, so from a Drive model an in-app navigation — today,
 * the alert's Reset after a failed Drive load (`navToDefault`) — left the
 * Drive modelPath in the store and the remounted CadView loaded the Drive
 * file again under an index.ifc URL. The seeds are real parsed routes
 * (`processGoogleFileId`, `processFile`), not hand-built objects, so they
 * carry the `downloadUrl` every production route has.
 */
describe('Share deciding whether a route names a new model', () => {
  const driveFileIdA = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
  const driveFileIdB = '1ZyXwVuTsRqPoNmLkJiHgFeDcBa543210'

  beforeEach(() => {
    useStore.setState({alert: null, modelPath: null})
  })

  /**
   * @param {string} prefix e.g. '/share/v/p'
   * @param {string} splat The route's '*', e.g. 'index.ifc'
   */
  function renderRoute(prefix, splat) {
    render(
      <MockComponent>
        <MemoryRouter initialEntries={[`${prefix}/${splat}`]}>
          <Routes>
            <Route
              path={`${prefix}/*`}
              element={<Share installPrefix='' appPrefix='/share' pathPrefix={prefix}/>}
            />
          </Routes>
        </MemoryRouter>
      </MockComponent>)
  }

  /**
   * @param {string} fileId
   * @return {object} The route result /share/v/g/<fileId> parses to
   */
  function driveModelPath(fileId) {
    return processGoogleFileId(new URL(`http://localhost/share/v/g/${fileId}`), fileId)
  }

  it('replaces a Drive modelPath when the route moves to a hosted file', async () => {
    useStore.setState({modelPath: driveModelPath(driveFileIdA)})
    renderRoute('/share/v/p', 'index.ifc')
    await actAsyncFlush()
    expect(useStore.getState().modelPath.kind).toBe('file')
    expect(useStore.getState().modelPath.filepath).toBe('index.ifc')
  })

  it('replaces a Drive modelPath when the route moves to another Drive file', async () => {
    useStore.setState({modelPath: driveModelPath(driveFileIdA)})
    renderRoute('/share/v/g', driveFileIdB)
    await actAsyncFlush()
    expect(useStore.getState().modelPath.fileId).toBe(driveFileIdB)
  })

  // Same downloadUrl, different route: the provenance quota and analytics
  // classify by must follow the route (codex review on #2026).
  it('replaces a hosted-file modelPath with a generic-URL route to the same file', async () => {
    useStore.setState({modelPath: processFile(new URL('http://localhost/share/v/p'), 'index.ifc')})
    renderRoute('/share/v/u', 'http://localhost/index.ifc')
    await actAsyncFlush()
    expect(useStore.getState().modelPath.kind).toBe('url')
  })

  it('keeps the modelPath when the route names the same Drive file', async () => {
    const seeded = driveModelPath(driveFileIdA)
    useStore.setState({modelPath: seeded})
    renderRoute('/share/v/g', driveFileIdA)
    await actAsyncFlush()
    // Same object: a re-parse of the same model must not re-trigger a load.
    expect(useStore.getState().modelPath).toBe(seeded)
  })
})
