import React from 'react'
import FixtureContext from '../FixtureContext'
import InputAutocomplete from './InputAutocomplete'


const elements = [
  {title: 'Surfaces'},
  {title: 'Case'},
  {title: 'Gears'},
  {title: 'Electonics'},
]

export default (
  <FixtureContext>
    <InputAutocomplete elements={elements} placeholder={'IFC property'}/>
  </FixtureContext>
)
