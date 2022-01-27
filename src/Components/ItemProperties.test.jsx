import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { mockViewer, newMockStringValueElt } from '../utils/Ifc.test'
import { mockRouted } from '../Routed.test'
import ItemProperties from './ItemProperties'


test('ItemProperties for single element', async () => {
  const testLabel = 'Test node label';
  const {getByText} = render(mockRouted(
    <ItemProperties
      viewer={mockViewer}
      element={newMockStringValueElt(testLabel)} />
  ));
  await waitFor(() => screen.getByText(testLabel));
  expect(getByText(testLabel)).toBeInTheDocument();
})
