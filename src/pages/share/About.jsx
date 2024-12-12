import React, {ReactElement} from 'react'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import TitledLayout from '../../layouts/TitledLayout'


/** @return {ReactElement} */
export default function About() {
  const prodPrefix = 'https://bldrs.ai/share/v/gh/bldrs-ai'
  return (
    <TitledLayout title='Bldrs Share: High-performance Web-based CAD sharing'>
      <iframe
        title='Bldrs Share: High-performance Web-based CAD sharing'
        width='420'
        height='315'
        style={{
          float: 'right',
          border: 'none',
          margin: '2em',
        }}
        src='https://www.youtube.com/embed/5_MDaM25IeE'
        frameBorder='0'
        allowFullScreen={true}
      />
      <Typography variant='p'>
        Bldrs Share is a high-performance web application for CAD model sharing and
        collaboration, built on open-source standards for speed, accuracy, and flexibility.
        Designed for real-time, browser-based teamwork, Bldrs Share empowers teams to
        effortlessly share detailed models and collaborate seamlessly from any device.
      </Typography>
      <Typography variant='h2'>
        <strong>Key Features of Bldrs Share</strong>
      </Typography>
      <Typography variant='h3'>
        <strong>Correct & Fast</strong>
      </Typography>
      <Typography variant='p'>
        We bring your complex CAD models to life (supporting
        &nbsp;<Link href={`${prodPrefix}/test-models/main/ifc/Schependomlaan.ifc#c:36.563,6.143,-16.59,5.457,5.29,0.326`}>IFC</Link>/
        &nbsp;<Link href={`${prodPrefix}/test-models/main/step/zoo.dev/a-gear.step`}>STEP</Link>,
        &nbsp;<Link href={`${prodPrefix}/test-models/main/stl/slotted_disk.stl#c:1.273,0.548,1.167,0.089,-0.072,-0.087`}>STL</Link>,
        &nbsp;<Link href={`${prodPrefix}/headless-three/main/models/obj/tree.obj`}>OBJ</Link> and
        more) with the highest quality and best-in-class performance.
      </Typography>
      <Typography variant='p'>
        <strong>Fast is our favorite feature!</strong>
      </Typography>
      <Typography variant='p'>
        <Link href='/share/about/conway'>Explore the Conway Engine →</Link>
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
