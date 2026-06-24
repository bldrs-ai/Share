import React from 'react'
import {render} from '@testing-library/react'
import {MockComponent} from './__mocks__/MockComponent'
import MockRoutes from './BaseRoutesMock.test'
// Slice 5d.4: Share renders the app, which loads ShareViewer (→
// IfcContext / ShareIfc). ShareViewer no longer self-imports the fork to
// trigger the Jest harness, so load it explicitly before `./Share` so
// the harness's dep mocks register first.
import 'web-ifc-viewer'
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
