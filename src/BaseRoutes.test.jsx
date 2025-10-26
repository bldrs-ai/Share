import React from 'react'
import {render} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {HelmetThemeCtx} from './Share.fixture'
import BaseRoutes from './BaseRoutes'


// Mock the complex components that we want to avoid testing
jest.mock('./ShareRoutes', () => {
  return function MockShareRoutes() {
    return <div data-testid='mock-share-routes'>Mock ShareRoutes</div>
  }
})

describe('BaseRoutes - Route Navigation Testing', () => {
  // TODO(pablo): Test ShareRoutes page at /share route

  it('renders About page at /about route', () => {
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/about']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/About Bldrs/)
  })

  it('renders Privacy page at /privacy route', () => {
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/privacy']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/Privacy Policy/)
  })

  it('renders TOS page at /tos route', () => {
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/tos']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/Terms of Service/)
  })

  it('renders BlogRoutes at /blog route', () => {
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/blog']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/Blog Posts/)
  })
})
