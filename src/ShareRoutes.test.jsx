import React from 'react'
import {render, waitFor} from '@testing-library/react'
import {MemoryRouter, Route, Routes, useLocation, useNavigationType} from 'react-router-dom'
import ShareRoutes from './ShareRoutes'


// Share mounts CadView and the whole viewer stack. This suite only
// exercises ShareRoutes' own forwards, so stub it out, keeping the
// pathPrefix it was handed so a test can tell which route rendered it.
jest.mock('./Share', () => {
  return function MockShare({pathPrefix}) {
    return <div data-testid='mock-share' data-path-prefix={pathPrefix}>Mock Share</div>
  }
})


/**
 * Captures the live router location so tests can assert on it.
 *
 * @param {Function} onLocation Called with the current location on every render
 * @return {null}
 */
function LocationSpy({onLocation}) {
  onLocation({...useLocation(), navigationType: useNavigationType()})
  return null
}


/**
 * Render ShareRoutes the way BaseRoutes mounts it — nested under a
 * `<appPrefix>/*` parent route, so its internal `<Route path='/'>` matches.
 *
 * @param {string} entry Initial URL
 * @param {string} [installPrefix] '' on bldrs.ai, '/Share' on GitHub Pages
 * @return {Function} Getter for the most recent router location
 */
function renderAt(entry, installPrefix = '') {
  const appPrefix = `${installPrefix}/share`
  let seen = null
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path={`${appPrefix}/*`}
          element={<ShareRoutes installPrefix={installPrefix} appPrefix={appPrefix}/>}
        />
      </Routes>
      <LocationSpy onLocation={(loc) => {
        seen = loc
      }}
      />
    </MemoryRouter>,
  )
  return () => seen
}


describe('ShareRoutes Forward', () => {
  it('forwards /share to /share/v/p', async () => {
    const location = renderAt('/share')
    await waitFor(() => expect(location().pathname).toBe('/share/v/p'))
  })

  // Regression guard. A bare `navigate(dest)` here dropped location.search,
  // so an ad click landing on the homepage lost its gclid before gtag.js
  // read window.location — GA4 then filed the paid session as
  // google/organic and Google Ads recorded no conversion.
  it('carries the query string through the forward', async () => {
    const location = renderAt('/share?gclid=TEST123')
    await waitFor(() => expect(location().pathname).toBe('/share/v/p'))
    expect(location().search).toBe('?gclid=TEST123')
  })

  it('preserves every param, not just known ones', async () => {
    const location = renderAt('/share?gclid=TEST123&utm_source=google&foo=bar')
    await waitFor(() => expect(location().pathname).toBe('/share/v/p'))
    expect(location().search).toBe('?gclid=TEST123&utm_source=google&foo=bar')
  })
})


// #1959: the local-only route's old name redirects to its new one, so old
// recents, bookmarks and copied links keep working.
describe('ShareRoutes legacy /v/new/ redirect', () => {
  const ID = '0b4c2f1e-8d6a-4c3b-9e2f-1a2b3c4d5e6f.ifc'

  it('rewrites /v/new/<id> to /v/local-only/<id> with replace, keeping search and hash', async () => {
    const location = renderAt(`/share/v/new/${ID}?feature=look#c:1,2,3`)
    await waitFor(() => expect(location().pathname).toBe(`/share/v/local-only/${ID}`))
    expect(location().search).toBe('?feature=look')
    expect(location().hash).toBe('#c:1,2,3')
    // replaceState, not pushState: Back must not land on the old URL and
    // bounce straight forward again.
    expect(location().navigationType).toBe('REPLACE')
  })

  it('renders Share for the local-only route, with its own path prefix', async () => {
    const {findByTestId} = render(
      <MemoryRouter initialEntries={[`/share/v/local-only/${ID}`]}>
        <Routes>
          <Route path='/share/*' element={<ShareRoutes installPrefix='' appPrefix='/share'/>}/>
        </Routes>
      </MemoryRouter>,
    )
    expect((await findByTestId('mock-share')).getAttribute('data-path-prefix')).toBe('/share/v/local-only')
  })

  it('redirects under the GitHub Pages install prefix too', async () => {
    const location = renderAt(`/Share/share/v/new/${ID}`, '/Share')
    await waitFor(() => expect(location().pathname).toBe(`/Share/share/v/local-only/${ID}`))
  })
})
