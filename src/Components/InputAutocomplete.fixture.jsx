import React from 'react'
import InputAutocomplete from './InputAutocomplete'
import {ThemeCtx} from '../theme/Theme.fixture'


/**
 * @property {Array<object>} exampleElements fixture sample elts
 * @property {string} examplePlaceholderText fixture placeholder text
 * @return {React.Element}
 */
export function createFixture({exampleElements, examplePlaceholderText}) {
  return (
    <ThemeCtx>
      <InputAutocomplete elements={exampleElements} placeholder={examplePlaceholderText}/>
    </ThemeCtx>
  )
}


export const exampleElements = [
  {title: 'Surfaces'},
  {title: 'Case'},
  {title: 'Gears'},
  {title: 'Electonics'},
]


export const examplePlaceholderText = 'Type something'
