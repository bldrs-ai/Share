import React from 'react'
import InputBar from '../../Components/InputBar'


export default {
  title: 'BLDRS UI/Input/InputBar',
  component: InputBar,
  argTypes: {
    icon: {
      options: ['github', 'building', 'upload'],
      control: {
        type: 'select',
      },
      defaultValue: 'github',
    },
    onClick: {
      action: 'clicked',
    },
  },
  parameters: {
    backgrounds: {
      default: 'light',
    },
  },
}

const Template = (args) => {
  return <InputBar {...args}/>
}

export const Input = Template.bind({})
