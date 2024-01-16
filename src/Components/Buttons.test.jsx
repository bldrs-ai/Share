import React from 'react'
import {fireEvent, render, renderHook, act} from '@testing-library/react'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import QuestionIcon from '../assets/icons/Question.svg'


describe('<TooltipIconButton/>', () => {
  test('should render successfully', async () => {
    const cb = jest.fn()
    const rendered = render(
        <TooltipIconButton
          tooltip={'Hello. Is it me you\'re looking for?'}
          icon={<QuestionIcon className='icon-share'/>}
          onClick={cb}
        />)

    const button = rendered.getByRole('button')

    fireEvent.click(button)
    expect(cb).toHaveBeenCalled()

    fireEvent.mouseOver(button)
    const tooltip = await rendered.findByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
  })


  test('show tooltip when the help is activated', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.toggleIsHelpTooltips()
    })
    const {getByText} = render(
        <TooltipIconButton
          tooltip={'TestTooltip'}
          icon={<QuestionIcon className='icon-share'/>}
          // eslint-disable-next-line no-empty-function
          onClick={() => {}}
        />)
    expect(await getByText('TestTooltip')).toBeVisible()
  })
})
