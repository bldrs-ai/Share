import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import {TooltipIconButton} from './Buttons'
import QuestionIcon from '../assets/2D_Icons/Question.svg'
import {MockComponent} from '../__mocks__/MockComponent'


describe('<TooltipIconButton />', () => {
  test('should throw error if missing required props', () => {
    expect(() => render(<MockComponent>
      <TooltipIconButton/>
    </MockComponent>)).toThrow('Arg 0 is not defined')
  })

  test('should render successfully', async () => {
    const rendered = render(<MockComponent>
      <TooltipIconButton
        data-testid={'test-button'}
        title={'Hello. Is it me you\'re looking for?'}
        onClick={() => {}}
        icon={<QuestionIcon/>}
      />
    </MockComponent>)

    const button = rendered.getByTestId('test-button')
    fireEvent.mouseOver(button)

    const tooltip = await rendered.findByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
  })
})
