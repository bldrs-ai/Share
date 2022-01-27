import React from 'react'
import { render } from '@testing-library/react'
import { mockViewer, newMockStringValueElt } from '../utils/Ifc.test'
import { mockRouted } from '../Routed.test'
import NavTree from './NavTree'


test('NavTree for single element', () => {
  const testLabel = 'Test node label';
  const {getByText} = render(mockRouted(
    <NavTree
      viewer={mockViewer}
      element={newMockStringValueElt(testLabel)} />
  ));
  expect(getByText(testLabel)).toBeInTheDocument();
})
