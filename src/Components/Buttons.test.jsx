import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import {MockComponent} from '../__mocks__/MockComponent'
import {TooltipIconButton} from './Buttons'
import QuestionIcon from '../assets/icons/Question.svg'


describe('<TooltipIconButton />', () => {
  test('should render successfully', async () => {
    const testId = 'test-button'
    const rendered = render(
        <MockComponent>
          <TooltipIconButton
            dataTestId={testId}
            title={'Hello. Is it me you\'re looking for?'}
            // eslint-disable-next-line no-empty-function
            onClick={() => {}}
            icon={<QuestionIcon/>}
          />
        </MockComponent>)

    const button = rendered.getByTestId(testId)
    fireEvent.mouseOver(button)

    const tooltip = await rendered.findByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
  })
})
