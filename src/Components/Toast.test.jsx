import React from 'react'
import {render} from '@testing-library/react'
import Toast from './Toast'


describe('Toast', () => {
  it('should open by default if the visible attribute value is NOT specified', () => {
    const {queryByText} = render(
      <Toast>This is a test toast notification.</Toast>,
    )

    expect(queryByText('This is a test toast notification.')).toBeInTheDocument()
  })

  it('should open if visible attribute is true', () => {
    const {queryByText} = render(
      <Toast visible={true}>This is a test toast notification.</Toast>,
    )

    expect(queryByText('This is a test toast notification.')).toBeInTheDocument()
  })

  it('should NOT open if visible attribute is NOT true', () => {
    const {queryByText} = render(
      <Toast visible={false}>This is a test toast notification.</Toast>,
    )

    expect(queryByText('This is a test toast notification.')).not.toBeInTheDocument()
  })

  it('should render a title if provided', () => {
    const {container} = render(
      <Toast title={'A test title!'}>This is a test notification.</Toast>,
    )

    const titles = container.getElementsByClassName('MuiAlertTitle-root')
    expect(titles).toHaveLength(1)
  })
})
