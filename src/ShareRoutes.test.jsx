import React from 'react'
import {render, waitFor} from '@testing-library/react'
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom'
import ShareRoutes from './ShareRoutes'


// Share mounts CadView and the whole viewer stack. This suite only
// exercises the /share -> /share/v/p forward, so stub it out.
jest.mock('./Share', () => {
  return function MockShare() {
    return <div data-testid='mock-share'>Mock Share</div>
  }
})


/**
 * Captures the live router location so tests can assert on it.
 *
 * @param {Function} onLocation Called with the current location on every render
 * @return {null}
 */
function LocationSpy({onLocation}) {
  onLocation(useLocation())
  return null
}


/**
 * Render ShareRoutes the way BaseRoutes mounts it — nested under a
 * `/share/*` parent route, so its internal `<Route path='/'>` matches.
 *
 * @param {string} entry Initial URL
 * @return {Function} Getter for the most recent router location
 */
function renderAt(entry) {
  let seen = null
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path='/share/*'
          element={<ShareRoutes installPrefix='' appPrefix='/share'/>}
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
