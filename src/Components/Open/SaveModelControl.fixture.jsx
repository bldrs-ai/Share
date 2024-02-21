import React from 'react'
import {RouteThemeCtx} from '../../Share.fixture'
import SaveModelControl from './SaveModelControl'


// For unit test
export const SaveModelControlFixture = () => <RouteThemeCtx><SaveModelControl/></RouteThemeCtx>


// For cosmos
export default {
  SaveModelControl: <SaveModelControlFixture/>,
}
