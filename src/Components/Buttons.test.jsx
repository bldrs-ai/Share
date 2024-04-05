import React from 'react'
import {fireEvent, render, renderHook, act} from '@testing-library/react'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import {ThemeCtx} from '../theme/Theme.fixture'
import QuestionIcon from '../assets/icons/Question.svg'


describe('<TooltipIconButton />', () => {
  it('should render successfully', async () => {
    const buttonTestId = 'test-button'
    const rendered = render(
        <ThemeCtx>
          <TooltipIconButton
            title='Hello. Is it me ur looking for?'
            // eslint-disable-next-line no-empty-function
            onClick={() => {}}
            icon={<QuestionIcon/>}
            placement='top'
            buttonTestId={buttonTestId}
          />
        </ThemeCtx>)

    const button = rendered.getByTestId(buttonTestId)
    fireEvent.mouseOver(button)

    const tooltip = await rendered.findByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
  })


  it('show tooltip when the help is activated', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setIsHelpTooltipsVisible(true)
    })
    const {getByText} = render(
        <ThemeCtx>
          <TooltipIconButton
            title='TestTooltip'
            // eslint-disable-next-line no-empty-function
            onClick={() => {}}
            icon={<QuestionIcon/>}
            placement='top'
          />
        </ThemeCtx>)
    expect(await getByText('TestTooltip')).toBeVisible()
  })
})
