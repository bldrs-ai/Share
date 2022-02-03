import React from 'react'
import { render } from '@testing-library/react'
import { mockRoutes } from './BaseRoutesMock.test'
import BaseRoutes from './BaseRoutes'


test('BaseRoutes', () => {
  const testLabel = 'Test node label';
  const {getByText} = render(mockRoutes(
    <BaseRoutes testElt={<>{testLabel}</>} />
  ));
  expect(getByText(testLabel)).toBeInTheDocument();
})
