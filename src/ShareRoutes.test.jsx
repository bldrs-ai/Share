import React from 'react'
import {render} from '@testing-library/react'
import {mockRoutes} from './BaseRoutesMock.test'
import ShareRoutes from './ShareRoutes'


test('ShareRoutes', () => {
  const {getByText} = render(mockRoutes(
    <ShareRoutes
      installPrefix={'/'}
      appPrefix={'share'} /> ))
  expect(getByText(/BLDRS/i)).toBeInTheDocument()
})
