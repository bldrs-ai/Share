import {getModelPath} from './Share'


jest.mock('three')


describe('Share', () => {
  it('getModelPath parses ifc and obj filepaths', () => {
    expect(getModelPath('/share', '/share/v/p', {'*': 'as_Ifcdf.ifc/1234'})).toStrictEqual({
      filepath: '/as_Ifcdf.ifc',
      eltPath: '/1234',
    })
  })


  it('getModelPath parses mixed-case ifc filepaths', () => {
    for (const ext of [
      'ifc', 'Ifc', 'IFC', 'IfC', 'iFc', 'IFc',
    ]) {
      const inPath = `as_${ext}df.${ext}/1234`
      expect(getModelPath('/share', '/share/v/p', {'*': inPath})).toStrictEqual({
        filepath: `/as_${ext}df.${ext}`,
        eltPath: '/1234',
      })
    }
  })
})


// TODO(88): Testing: headless screenshot regression testing
/*
import Canvas from 'canvas'
// Needed for async test
import 'regenerator-runtime/runtime'
import * as THREE from 'three'
import * as gl from 'gl'


const glContext = gl(1, 1) // headless-gl

beforeAll(() => {
  const window = {innerWidth: 800, innerHeight: 600}
  const canvasGL = new Canvas.Canvas(window.innerWidth, window.innerHeight)
  // mock function to avoid errors inside THREE.WebGlRenderer()
  canvasGL.addEventListener = function(event, func, bind_) {}
  const mockRenderer = new THREE.WebGLRenderer({
    context: glContext,
    antialias: true,
    canvas: canvasGL,
  })

  jest.mock('three', () => ({
    ...jest.requireActual('three'),
    WebGLRenderer: jest.fn().mockImplementation(() => {
      return mockRenderer
    }),
  }))
})


import React from 'react'
import {render} from '@testing-library/react'
import {MockRoutes} from '../BaseRoutesMock.test'
import Share from './Share'


test('Share', () => {
  const {getByText} = render(
      <MockRoutes
        contentElt={
          <Share
            installPrefix={'/'}
            appPrefix={'share'}
            pathPrefix={'v/p'} />}/>)
  expect(getByText(/BLDRS/i)).toBeInTheDocument()
})
*/
