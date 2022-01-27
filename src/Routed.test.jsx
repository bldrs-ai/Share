import React from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'


test('Test helper: mockRouted', () => {
  const testLabel = 'Test node label';
  const {getByText} = render(mockRouted(
    <>{testLabel}</>
  ));
  expect(getByText(testLabel)).toBeInTheDocument();
});


export const mockRouted = (contentElt) => {
  return (
    <MemoryRouter>
      <Routes>
        <Route path="/" element={contentElt} />
      </Routes>
    </MemoryRouter>
  );
}
