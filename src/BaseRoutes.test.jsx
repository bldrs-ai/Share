import React from 'react'
import {render} from '@testing-library/react'
import MockRoutes from './BaseRoutesMock.test'
import BaseRoutes from './BaseRoutes'


/**
 * TODO(pablo): fix flaky test
 * RangeError: /Users/olegmoshkovich/Desktop/builders/Share/node_modules/web-ifc/web-ifc-api.js:
 * Maximum call stack size exceeded
 */
test('BaseRoutes', () => {
  const testLabel = 'Test node label'
  const {getByText} = render(
      <MockRoutes
        contentElt={<BaseRoutes testElt={<>{testLabel}</>}/>}
      />)
  expect(getByText(testLabel)).toBeInTheDocument()
})
