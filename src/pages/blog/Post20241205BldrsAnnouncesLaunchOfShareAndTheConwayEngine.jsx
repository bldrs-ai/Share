import React, {ReactElement} from 'react'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import BlogPostLayout from '../../layouts/BlogPostLayout'


/** @return {ReactElement} */
export default function FirstPost() {
  return (
    <BlogPostLayout title='Bldrs Announces Launch of Share and the Conway Engine' dateline='2024-12-05'>
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
        Start using <Link href="/">Bldrs Share</Link> today to transform your CAD workflows. Join our
        community, explore the documentation, and contribute to the development of the
        next-generation CAD tooling.
      </Typography>
      <Typography variant='p'>
        For more information, visit our project repositories on GitHub:
        <ul>
          <li><Link href="https://github.com/bldrs-ai/Share">Share</Link></li>
          <li><Link href="https://github.com/bldrs-ai/conway">Conway Engine</Link></li>
        </ul>
      </Typography>
      <Typography variant='p'>
        <strong>🙌 Join the Conversation</strong>
      </Typography>
      <Typography variant='p'>
        We&apos;d love to hear your thoughts, questions, and feedback! Join us on
        <Link href="https://discord.gg/9SxguBkFfQ">
          Discord
        </Link>
        to connect with the team and other users, or drop us an issue or pull request on
        <Link href="https://github.com/bldrs-ai/Share">
          GitHub
        </Link>.
      </Typography>
    </BlogPostLayout>
  )
}
