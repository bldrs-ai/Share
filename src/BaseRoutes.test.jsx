import React from 'react'
import {render} from '@testing-library/react'
import {mockRoutes} from './BaseRoutesMock.test'
import BaseRoutes from './BaseRoutes'
import {setDebugLevel} from './utils/debug'


setDebugLevel(0)
/**
 * TODO(pablo): fix flacky test
 * RangeError: /Users/olegmoshkovich/Desktop/builders/Share/node_modules/web-ifc/web-ifc-api.js:
 * Maximum call stack size exceeded
 */
test('BaseRoutes', () => {
  const testLabel = 'Test node label'
  const {getByText} = render(mockRoutes(
      <BaseRoutes testElt={<>{testLabel}</>} />,
  ))
  expect(getByText(testLabel)).toBeInTheDocument()
})
