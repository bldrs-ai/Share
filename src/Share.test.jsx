import React from 'react'
import {render, screen} from '@testing-library/react'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {MockComponent} from './__mocks__/MockComponent'
import MockRoutes from './BaseRoutesMock.test'
import useStore from './store/useStore'
import {UNSUPPORTED_FILE_ALERT} from './routes/routes'
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
