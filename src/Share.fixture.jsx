import React, {ReactElement} from 'react'
import {HelmetProvider} from 'react-helmet-async'
import {MemoryRouter} from 'react-router'
import {StoreCtx} from './store/Store.fixture'
import {ThemeCtx} from './theme/Theme.fixture'


/**
 * Mostly for dialogs, which are often titled and routed
 *
 * @property {Array.<ReactElement>} children The component under test
 * @return {ReactElement}
 */
export function HelmetStoreRouteThemeCtx({children}) {
  return <HelmetProvider><StoreRouteThemeCtx>{children}</StoreRouteThemeCtx></HelmetProvider>
}


/**
 * For Pages like About and Blog.
 *
 * @property {Array.<ReactElement>} children The component under test
 * @return {ReactElement}
 */
export function HelmetThemeCtx({children}) {
  return <HelmetProvider><ThemeCtx>{children}</ThemeCtx></HelmetProvider>
}


/**
 * @property {Array.<ReactElement>} children The component under test
 * @return {ReactElement}
 */
export function RouteThemeCtx({children}) {
  return <MemoryRouter><ThemeCtx>{children}</ThemeCtx></MemoryRouter>
}


/**
 * @property {Array.<ReactElement>} children The component under test
 * @return {ReactElement}
 */
export function StoreRouteThemeCtx({children}) {
  return <StoreCtx><RouteThemeCtx>{children}</RouteThemeCtx></StoreCtx>
}
