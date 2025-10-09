import React from 'react'
import {render} from '@testing-library/react'
import {MockComponent} from './__mocks__/MockComponent'
import MockRoutes from './BaseRoutesMock.test'
import Share from './Share'


test('Share renders without crashing', () => {
  // This test verifies that the Share component can render without throwing errors
  // The main fix was updating pathPrefix checks to work without leading '/'
  const {container} = render(
    <MockComponent>
      <MockRoutes
        contentElt={
          <Share
            installPrefix='/'
            appPrefix='share'
            pathPrefix='share/v/p'
          />}
      />
    </MockComponent>)
  // Just verify the component renders (container exists)
  expect(container).toBeTruthy()
})
