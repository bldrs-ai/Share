import React from 'react'
import {TooltipToggleButton, RectangularButton} from '../../Components/Buttons'
import {ArrowBack, ArrowForward, Check} from '@mui/icons-material'
import {GitHub} from '../../assets/2D_Icons/GitHub.svg'


export default {
  title: 'BLDRS UI/Buttons/RectangularButton',
  component: TooltipToggleButton,
  argTypes: {
    icon: {
      options: ['add', 'back', 'check', 'forward', 'github'],
      mapping: {
        github: <GitHub />,
        back: <ArrowBack />,
        check: <Check />,
        forward: <ArrowForward />,
      },
      control: {
        type: 'select',
      },
      defaultValue: 'add',
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
    title: 'Open from Github',
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
}

const Template = (args) => {
  return <RectangularButton title={'open from github'} icon={<GitHub/>} />
}

export const Button = Template.bind({})
