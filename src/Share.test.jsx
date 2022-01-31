import Canvas from 'canvas'
// Needed for async test
import 'regenerator-runtime/runtime'
import * as THREE from 'three'
const glContext = require('gl')(1,1); //headless-gl


beforeAll(() => {
  const window = { innerWidth: 800, innerHeight: 600 };
  const canvasGL = new Canvas.Canvas(window.innerWidth, window.innerHeight);
  // mock function to avoid errors inside THREE.WebGlRenderer()
  canvasGL.addEventListener = function(event, func, bind_) {};
  const mockRenderer = new THREE.WebGLRenderer( { context: glContext, antialias: true, canvas: canvasGL });

  jest.mock('three', () => ({
    ...jest.requireActual('three'),
    WebGLRenderer: jest.fn().mockImplementation(() => {
      return mockRenderer;
    })
  }));
});


import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { render } from '@testing-library/react'
import Share from './Share'


test('BLDRS should be in main sceen', async () => {
  const {getByText} = render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={ <Share/> } />
      </Routes>
    </MemoryRouter>)
  expect(getByText(/BLDRS/i)).toBeInTheDocument()
})
