import React from 'react'
import {ThemeCtx} from '../theme/Theme.fixture'
import SaveModelControl from './SaveModelControl'


// For unit test
export const SaveModelControlFixture = () => <ThemeCtx><SaveModelControl/></ThemeCtx>


// For cosmos
export default {
  SaveModelControl: <SaveModelControlFixture/>,
}
