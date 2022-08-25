import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import {TooltipIconButton} from './Buttons'
import QuestionIcon from '../assets/2D_Icons/Question.svg'
import {MockComponent} from '../__mocks__/MockComponent'

// When this test i ran an error is thrown by the assert as expected therefore the test is passing,
// but the error is printed on the screen making it look like something is wrong.
describe('<TooltipIconButton />', () => {
  test('should throw error if missing required props', () => {
    expect(() => render(<MockComponent>
      <TooltipIconButton/>
    </MockComponent>)).toThrowError('Arg 0 is not defined')
  })

  test('should render successfully', async () => {
    /* eslint-disable no-empty-function */
    const rendered = render(<MockComponent>
      <TooltipIconButton
        data-testid={'test-button'}
        title={'Hello. Is it me you\'re looking for?'}
        onClick={() => {}}
        icon={<QuestionIcon/>}
      />
    </MockComponent>)
    /* eslint-enable no-empty-function */

    const button = rendered.getByTestId('test-button')
    fireEvent.mouseOver(button)

    const tooltip = await rendered.findByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
  })
})
