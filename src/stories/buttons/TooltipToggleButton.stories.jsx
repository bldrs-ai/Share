import React from 'react'
import {TooltipToggleButton} from '../../Components/Buttons'
import {AddCircle, ArrowBack, ArrowForward, Check} from '@mui/icons-material'


export default {
  title: 'BLDRS UI/Buttons/TooltipToggleButton',
  component: TooltipToggleButton,
  argTypes: {
    icon: {
      options: ['add', 'back', 'check', 'forward'],
      mapping: {
        add: <AddCircle />,
        back: <ArrowBack />,
        check: <Check />,
        forward: <ArrowForward />,
      },
      control: {
        type: 'select',
      },
      defaultValue: 'check',
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
      defaultValue: 'left',
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
    title: 'Only Appears on Hover',
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
}

const Template = (args) => {
  return (
    <TooltipToggleButton
      {...args}
    />
  )
}

export const Button = Template.bind({})
