import React, {ReactElement} from 'react'
import {Box, Link, Typography} from '@mui/material'
import {useIsMobile} from '../../Components/Hooks'
import TitledLayout from '../../layouts/TitledLayout'


/** @return {ReactElement} */
export default function About() {
  const isMobile = useIsMobile()
  const prodPrefix = 'https://bldrs.ai/share/v/gh/bldrs-ai'
  return (
    <TitledLayout title='Bldrs Share: High-performance Web-based CAD sharing'>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          float: 'right',
          margin: isMobile ? '0' : '0 0 1em 2em',
        }}
      >
        <Link href='/share/about/conway'>
          <img
            src='/speedtest.png'
            alt='Conway vs Industry Leaders - Speed test graph'
            width='600'
            style={{
              marginBottom: '0.5em',
              maxWidth: '100%',
            }}
          />
          <Box sx={{textAlign: 'center'}}>
            Explore the Conway Engine →
          </Box>
        </Link>
      </Box>
      <Typography variant='p'>
        Bldrs Share is a high-performance browser-based application for CAD model viewingsharing and
        collaboration.  Share is built on open-source standards for speed, accuracy, and flexibility.
        Designed for real-time, browser-based teamwork, Bldrs Share empowers teams to
        effortlessly share detailed models and collaborate seamlessly from any device.
      </Typography>
      <Typography variant='p'>
        Read our:
        <ul>
          <li><Link href='/tos'>Terms of Service</Link></li>
          <li><Link href='/privacy'>Privacy Policy</Link></li>
        </ul>
      </Typography>
      <Typography variant='h2'>
        <strong>Key Features of Bldrs Share</strong>
      </Typography>
      <Typography variant='h3'>
        <strong>Correct & Fast</strong>
      </Typography>
      <Typography variant='p'>
        We bring your complex CAD models to life, supporting
        &nbsp;<Link href={`${prodPrefix}/test-models/main/ifc/Schependomlaan.ifc#c:36.563,6.143,-16.59,5.457,5.29,0.326`}>IFC</Link>,
        &nbsp;<Link href={`${prodPrefix}/test-models/main/stl/slotted_disk.stl#c:1.273,0.548,1.167,0.089,-0.072,-0.087`}>STL</Link>,
        &nbsp;<Link href={`${prodPrefix}/headless-three/main/models/obj/tree.obj`}>OBJ</Link>,
        &nbsp;and initial support for <Link href={`${prodPrefix}/test-models/main/step/zoo.dev/a-gear.step`}>STEP</Link>
        &nbsp;with the highest quality and best-in-class performance.
        <br/>
      </Typography>
      <Typography variant='h2'>
        <strong>Browser-First, Desktop-Free</strong>
      </Typography>
      <Typography variant='p'>
        Share lets you simply drag-and-drop your model files for instant browser-based viewing,
        eliminating backend latency, SaaS dependencies, and data residency issues. Work from
        anywhere, on any device, with just a web connection.
      </Typography>
      <Typography variant='h2'>
        <strong>GitHub Integration for Team Collaboration</strong>
      </Typography>
      <Typography variant='p'>
        Access, manage, and share your models using your GitHub credentials. With seamless
        GitHub integration, Share lets you keep your model library organized and accessible, while
        making it easy to log changes, share projects, and collaborate across teams.
      </Typography>
      <Typography variant='p'>
        Notes, Cameras and Pins Capture specific views and sections of the model, drop pins on
        geometry, and link notes to particular elements or perspectives. These tools make sharing
        insights and feedback effortless, so teams stay aligned throughout the design process.
      </Typography>
      <Typography variant='p'>
        Versioning and History Tracking Built on Git version control, Share provides intuitive
        versioning that makes it simple to navigate model history, manage revisions, and keep
        track of design evolution over time.
      </Typography>
      <Typography variant='h2'>
        <strong>Navigation</strong>
      </Typography>
      <Typography variant='p'>
        Explore 3D geometry with ease—navigate spatial structures, elements, and properties
        directly within the interface. Manage element attributes and IFC Property Sets in a
        clear, streamlined view, enabling precise control over model details.
      </Typography>
    </TitledLayout>
  )
}
