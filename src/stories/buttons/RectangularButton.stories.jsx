import React from 'react'
import {UilBuilding, UilUpload} from '@iconscout/react-unicons'
import {RectangularButton} from '../../Components/Buttons'


export default {
  title: 'BLDRS UI/Buttons/RectangularButton',
  component: RectangularButton,
  argTypes: {
    icon: {
      options: ['github', 'building', 'upload'],
      mapping: {
        building: <UilBuilding/>,
        upload: <UilUpload/>,
      },
      control: {
        type: 'select',
      },
      defaultValue: 'upload',
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
