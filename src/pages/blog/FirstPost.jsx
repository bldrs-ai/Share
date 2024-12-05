import React, {ReactElement} from 'react'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {LogoBWithDomain} from '../../Components/Logo/Logo'


/** @return {ReactElement} */
export default function About() {
  return (
    <Paper variant='page-background' sx={{height: '100vh', overflowY: 'scroll'}}>
      <Stack
        direction='row'
        sx={{
          gap: '1em',
        }}
      >
        <Stack>
          <Paper variant='page' elevation={2}>
            <LogoBWithDomain sx={{width: '8rem', height: '8rem'}}/>
          </Paper>
        </Stack>
        <Stack sx={{flexGrow: 1, margin: '0 8rem 0 0'}}>
          <Paper
            variant='page'
            elevation={2}
            sx={{
              '& .MuiTypography-root': {
                margin: '1em 0',
              },
              '& .MuiTypography-p + .MuiTypography-p': {
                display: 'block',
              },
            }}
          >
            <Typography variant='h1'>Bldrs Announces Launch of Share and the Conway Engine</Typography>
            <Typography variant='h2'>Pioneering a New Wave in Open-Source Design & Engineering Collaboration</Typography>
            <Typography variant='p'>
              Bldrs is thrilled to unveil Share and its Conway Engine, a powerful web application
              crafted for high-performance CAD collaboration in contemporary engineering workflows.
              These tools are the result of years of intensive research, development, and engineering,
              marking the official launch of Bldrs’ open-source and commercial strategy.
            </Typography>
            <Typography variant='h3'>Why Bldrs Share & Conway Engine?</Typography>
            <Typography variant='p'>
              Engineering teams in the built world have been tethered to outdated desktop CAD tools,
              proprietary formats, and sluggish SaaS solutions. Drawing on our decades of experience in
              software innovation, Bldrs introduces a browser-first, real-time collaboration platform that
              supports federated versioning, open-source, and open-standard tooling—tailored for modern
              workflows and designed for architects, engineers, industrial designers, manufacturers, and
              operators leading the world’s most impactful projects.
            </Typography>
            <Typography variant='p'>
              Share and Conway Engine are designed to help builder communities overcome the collaboration
              limitations common in current CAD tools. Modern cross-functional teams require frictionless,
              high-performance web-based visualization, real-time collaboration, visual issue tracking and
              seamless integration with automation.  Regardless of your discipline, Share and Conway Engine
              unlock a new level of capability in CAD model sharing.
            </Typography>
            <Typography variant='p'>
              As an open-source project, Share will remain accessible, customizable, and adaptable for
              all users, from independent creators to large-scale enterprise teams.
              We invite the community to share feedback, collaborate, and shape the future of these tools to
              Build Every Thing Together.
            </Typography>
            <Typography variant='h3'>Why Bldrs Share & Conway Engine?</Typography>
            <Typography variant='p'>
              Start using Bldrs Share today to transform your CAD workflows. Join our community, explore the
              documentation, and contribute to the development of the next-generation CAD tooling.
            </Typography>
            <Typography variant='p'>
              For more information, visit our project repositories on GitHub:
              <ul>
                <li><Link href="https://github.com/bldrs-ai/Share">Share</Link></li>
                <li><Link href="https://github.com/bldrs-ai/conway">Conway Engine</Link></li>
              </ul>
            </Typography>
          </Paper>
        </Stack>
      </Stack>
    </Paper>
  )
}
