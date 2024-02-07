import React from 'react'
import {RouteThemeCtx} from '../Share.fixture'
import OpenModelControl from './OpenModelControl'


// For unit test
export const OpenModelControlFixture =
  () => <RouteThemeCtx><OpenModelControl/></RouteThemeCtx>


// For cosmos
export default {
  OpenModelControl: <OpenModelControlFixture/>,
}
