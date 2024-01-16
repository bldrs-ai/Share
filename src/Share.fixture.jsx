import React from 'react'
import {HelmetProvider} from 'react-helmet-async'
import {MemoryRouter} from 'react-router'
import {StoreCtx} from './store/Store.fixture'
import {ThemeCtx} from './theme/Theme.fixture'


/**
 * @property {Array.<React.Component>} children The component under test
 * @return {React.Component}
 */
export function RouteThemeCtx({children}) {
  return <MemoryRouter><ThemeCtx>{children}</ThemeCtx></MemoryRouter>
}


/**
 * @property {Array.<React.Component>} children The component under test
 * @return {React.Component}
 */
export function StoreRouteThemeCtx({children}) {
  return <StoreCtx><RouteThemeCtx>{children}</RouteThemeCtx></StoreCtx>
}


/**
 * Mostly for dialogs, which are often titled and routed
 *
 * @property {Array.<React.Component>} children The component under test
 * @return {React.Component}
 */
export function HelmetStoreRouteThemeCtx({children}) {
  return <HelmetProvider><StoreRouteThemeCtx>{children}</StoreRouteThemeCtx></HelmetProvider>
}
