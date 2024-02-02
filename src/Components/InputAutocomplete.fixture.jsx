import React from 'react'
import InputAutocomplete from './InputAutocomplete'
import {ThemeCtx} from '../theme/Theme.fixture'


const elements = [
  {title: 'Surfaces'},
  {title: 'Case'},
  {title: 'Gears'},
  {title: 'Electonics'},
]

export default (
  <ThemeCtx>
    <InputAutocomplete elements={elements} placeholder={'IFC property'}/>
  </ThemeCtx>
)
