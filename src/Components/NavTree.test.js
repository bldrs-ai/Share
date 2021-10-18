import React from 'react'
import {rest} from 'msw'
import {setupServer} from 'msw/node'
import {render, fireEvent, waitFor, screen} from '@testing-library/react'
import '@testing-library/jest-dom'
import NavTree from './NavTree.js'

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

test('loads and displays NavTree node', async () => {
  const testLabel = 'Test node label';
  const {container, getByText} = render(
    <NavTree viewer={{getProperties: () => {
               return {
                 then: cb => {
                   cb({
                     Name: {
                       value: testLabel
                     }
                   });
                 }
               };
             }}} element={{children: []}}/>)

  await waitFor(() => screen.getByRole('treeitem'))
  expect(getByText(testLabel)).toBeInTheDocument()
})
