import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import {MockComponent} from '../__mocks__/MockComponent'
import {TooltipIconButton} from './Buttons'
import QuestionIcon from '../assets/icons/Question.svg'


describe('<TooltipIconButton />', () => {
  test('should render successfully', async () => {
    const testId = 'test-button'
    const rendered = render(
        <TooltipIconButton
          dataTestId={testId}
          title={'Hello Button'}
          // eslint-disable-next-line no-empty-function
          onClick={() => {}}
          icon={<QuestionIcon/>}
        />, {wrapper: MockComponent})

    const button = rendered.getByTitle('Hello Button')
    fireEvent.mouseOver(button)

    const tooltip = await rendered.findByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
  })
})
