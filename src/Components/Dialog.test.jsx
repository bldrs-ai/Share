import React from 'react'
import {render} from '@testing-library/react'
import DialogFixture, {exampleHeaderText} from './Dialog.fixture'


const FixtureWrapper = ({fixture}) => <>{fixture}</>


describe('Dialog', () => {
  it('renders', () => {
    const {getByText} = render(<FixtureWrapper fixture={DialogFixture}/>)
    expect(getByText(exampleHeaderText)).toBeInTheDocument()
  })
})
