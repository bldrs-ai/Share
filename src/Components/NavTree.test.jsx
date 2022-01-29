import React from 'react'
import { render } from '@testing-library/react'
import { MockViewer, newMockStringValueElt } from '../utils/Ifc.test'
import { mockRouted } from '../Routed.test'
import NavTree from './NavTree'


test('NavTree for single element', () => {
  const testLabel = 'Test node label';
  const {getByText} = render(mockRouted(
    <NavTree
      viewer={new MockViewer}
      element={newMockStringValueElt(testLabel)} />
  ));
  expect(getByText(testLabel)).toBeInTheDocument();
})
