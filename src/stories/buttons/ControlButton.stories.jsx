import React from 'react'
import {useArgs} from '@storybook/addons'
import {ControlButton} from '../../Components/Buttons'
import {AddCircle, Announcement, ArrowBack, ArrowForward, Check, Help} from '@mui/icons-material'
import Dialog from '../../Components/Dialog'


export default {
  title: 'BLDRS UI/Buttons/ControlButton',
  component: ControlButton,
  argTypes: {
    icon: {
      options: ['add', 'back', 'check', 'forward', 'help'],
      mapping: {
        add: <AddCircle />,
        back: <ArrowBack />,
        check: <Check />,
        forward: <ArrowForward />,
        help: <Help />,
      },
      control: {
        type: 'select',
      },
      defaultValue: 'help',
    },

    onClick: {
      action: 'clicked',
    },

    placement: {
      control: {
        type: 'select',
      },
      options: {
        'bottom-end': 'bottom-end',
        'bottom-start': 'bottom-start',
        'bottom': 'bottom',
        'left-end': 'left-end',
        'left-start': 'left-start',
        'left': 'left',
        'right-end': 'right-end',
        'right-start': 'right-start',
        'right': 'right',
        'top-end': 'top-end',
        'top-start': 'top-start',
        'top': 'top',
      },
      defaultValue: 'right',
    },

    size: {
      control: {
        type: 'select',
      },
      options: {
        small: 'small',
        medium: 'medium',
        large: 'large',
      },
      defaultValue: 'medium',
    },
  },
  args: {
    isDialogDisplayed: true,
    title: 'Only Appears on Hover',
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
}

const Template = (args) => {
  const [{isDialogDisplayed}, updateArgs] = useArgs()
  const setIsDialogDisplayed = (v) => updateArgs({isDialogDisplayed: v})
  const dialog = (
    <Dialog
      icon={<Announcement />}
      headerText={'Example Dialog'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<>Example content.</>}
    />
  )

  return (
    <ControlButton
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={dialog}
      {...args}
    />
  )
}

export const Button = Template.bind({})
