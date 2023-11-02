import React from 'react'
import {useSelect, useValue} from 'react-cosmos/client'
import FixtureContext from '../FixtureContext'
import Toast from './Toast'


// eslint-disable-next-line react/display-name
export default () => {
  const [severity] = useSelect('severity', {
    options: [
      'error',
      'warning',
      'info',
      'success',
    ],
  })

  const [title] = useValue('title', {
    defaultValue: '',
  })

  const [closeTimeout] = useValue('closeTimeout', {
    defaultValue: 30000,
  })

  return (
    <FixtureContext>
      <Toast severity={severity} title={title} closeTimeout={closeTimeout}>
        Your rendering has completed!
      </Toast>
    </FixtureContext>
  )
}
