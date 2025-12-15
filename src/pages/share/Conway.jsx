import React, {ReactElement} from 'react'
import {Box, Link, Typography} from '@mui/material'
import TitledLayout from '../../layouts/TitledLayout'


/** @return {ReactElement} */
export default function Conway() {
  return (
    <TitledLayout title='Conway IFC & STEP Engine: Performance Meets Precision'>
      <Typography variant='h2'>
        Conway powers Bldrs Share with unparalleled performance, bringing high-quality,
        precision CAD to the web. This cutting-edge CAD engine, designed specifically for
        IFC and STEP formats, offers advanced geometric representation, enabling teams to
        open and visualize intricate models with exceptional accuracy and speed.
      </Typography>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          margin: '0 0 1em 2em',
        }}
      >
        <img
          src='/speedtest.png'
          alt='Conway vs Industry Leaders - Speed test graph'
          width='100%'
        />
      </Box>
      <Typography variant='h2'>
        <strong>Key Advancements of Conway Engine</strong>
      </Typography>
      <Typography variant='h3'>
        <strong>Unified Core for IFC & STEP Standards</strong>
      </Typography>
      <Typography variant='h3'>
        <strong>conway-geom</strong> is Bldrs’ rewrite of web-ifc, engineered for
        high-performance and to support the full suite of open CAD standards within the
        IFC and STEP families.
        <ul>
          <li><strong>Fast near-exact CSG</strong>: Our cutting-edge implementation of
            Constructive Solid Geometry (CSG) partly based on
          <Link href="https://arxiv.org/pdf/2405.12949">
              “Exact predicates, exact constructions and combinatorics for mesh CSG”
          </Link> - Lévy et al. 2024, with
            robust handling of real-world model data, tailored for the web environment.
          </li>
          <li><strong>Seamless NURBS and Advanced BREP</strong>: Conway ensures smooth
            handling of Non-Uniform Rational B-Splines (NURBS) and Advanced Boundary
            Representation (BREP), with adaptive tesselation preserving accuracy and quality
            across complex geometries to streamline workflows for intricate designs.
          </li>
          <li><strong>Advanced Model Introspection</strong>: More than pretty pictures,
            Conway gives type-safe access and powerful querying including geometric relations.
          </li>
          <li><strong>Enhanced Memory Handling</strong>: Enables smooth, lag-free interaction
            with large, highly detailed 3D models across devices, even with complex assets or
            high-poly designs.
          </li>
          <li><strong>Web Geom</strong>: Common libraries shared with web-ifc, including
            Earcut, Manifold, csgjs-cpp, fast_float, GLM, and tinynurbs for robust,
            high-speed processing.
          </li>
        </ul>
      </Typography>
      <Typography variant='h3'>
        <strong>Complete coverage of IFC 2x3 & 4</strong>
      </Typography>
      <Typography variant='h3'>
        Conway fully covers IFC standards with high-fidelity, high-performance BIM support,
        offering parsing and validation bindings for 900+ IFC entities across over 7,000 pages of
        specifications.
        <ul>
          <li><strong>Engineering-Grade Source Code</strong>: Includes 500k lines of code in
            JS, TS and C++, with an auto-generated type-safe schema-compliant framework.
          </li>
          <li><strong>Exhaustive Testing</strong>: hundreds of unit tests and a large suite of
            proprietary industrial models for our automated regression and performance testing
            frameworks.
          </li>
        </ul>
      </Typography>
      <Typography variant='h3'>
        <strong>Preliminary support for STEP AP214</strong>
      </Typography>
      <Typography variant='h3'>
        Initial support for STEP AP214 expands Conway’s capabilities to include automotive and
        3D printing applications.
      </Typography>
    </TitledLayout>
  )
}
