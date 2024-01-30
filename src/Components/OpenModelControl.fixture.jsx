import React from 'react'
import {ThemeCtx} from '../theme/Theme.fixture'
import OpenModelControl from './OpenModelControl'


// For unit test
export const OpenModelControlFixture = () => <ThemeCtx><OpenModelControl/></ThemeCtx>


// For cosmos
export default {
  OpenModelControl: <OpenModelControlFixture/>,
}
