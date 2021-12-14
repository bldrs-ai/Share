import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import NavTree from './NavTree'
// Needed for async test
import 'regenerator-runtime/runtime'


test('loads and displays NavTree node', async () => {
  const testLabel = 'Test node label';
  const {getByText} = render(
    <MemoryRouter>
      <Routes>
        <Route path="/"
               element={<NavTree viewer={{}}
                                 element={{
                                   children: [],
                                   expressID: 1,
                                   Name: {
                                     value: testLabel
                                   }}}/>}
        />
      </Routes>
    </MemoryRouter>)
  await waitFor(() => screen.getByRole('treeitem'));
  expect(getByText(testLabel)).toBeInTheDocument()
})
