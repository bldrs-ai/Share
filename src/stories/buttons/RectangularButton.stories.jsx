import React from 'react'
import {RectangularButton} from '../../Components/Buttons'
import {UilGithub, UilBuilding, UilUpload} from '@iconscout/react-unicons'



export default {
  title: 'BLDRS UI/Buttons/RectangularButton',
  component: RectangularButton,
  argTypes: {
    icon: {
      options: ['github', 'building', 'upload'],
      mapping: {
        github: <UilGithub />,
        building: <UilBuilding />,
        upload: <UilUpload />,
      },
      control: {
        type: 'select',
      },
      defaultValue: 'github',
    },
    onClick: {
      action: 'clicked',
    },
  },
  args: {
    title: 'Upload from device',
  },
  parameters: {
    backgrounds: {
      default: 'light',
    },
  },
}

const Template = (args) => {
  return <RectangularButton type='contained' {...args}/>
}

export const Button = Template.bind({})
