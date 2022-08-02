import React from 'react'
import {FormButton} from '../../Components/Buttons'
import {AddCircle, ArrowBack, ArrowForward, Check, Search} from '@mui/icons-material'


export default {
  title: 'BLDRS UI/Buttons/FormButton',
  component: FormButton,
  argTypes: {
    icon: {
      options: ['add', 'back', 'check', 'forward', 'search'],
      mapping: {
        add: <AddCircle />,
        back: <ArrowBack />,
        check: <Check />,
        forward: <ArrowForward />,
        search: <Search />,
      },
      control: {
        type: 'select',
      },
      defaultValue: 'search',
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

    type: {
      control: {
        type: 'select',
      },
      options: {
        submit: 'submit',
      },
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
  return <FormButton
    {...args}
  />
}

export const Button = Template.bind({})
