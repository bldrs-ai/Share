import React, {ReactElement} from 'react'
import {Typography, Link, Box} from '@mui/material'
import TitledLayout from '../layouts/TitledLayout'


/** @return {ReactElement} */
export default function Privacy() {
  return (
    <TitledLayout title='Privacy Policy'>
      <Box sx={{display: 'grid'}}>
        <Typography variant='body1'><strong>Effective Date:</strong> January 1, 2022</Typography>
        <Typography variant='body1'><strong>Last Updated:</strong> October 23, 2025</Typography>

        <Typography variant='body1'>
          Bldrs Share (“we,” “us,” “our”) provides open-source, browser-first tools for viewing and
          collaborating on 3D model files (e.g., IFC, STEP) using our Conway Engine. We design our software
          to minimize data collection and maximize user control.
        </Typography>

        <Typography variant='h1'>1. Information We Collect</Typography>
        <Typography variant='body1'>
          Bldrs Share is built to operate <strong>without centralized data storage</strong>. We do not host
          user content or model data by default. Depending on your configuration:
        </Typography>
        <Typography variant='body1'>
          <strong>Authentication data.</strong> When you sign in via Auth0/Google or another provider,
          we receive basic profile information (name, email, avatar) to create or identify your account.
        </Typography>
        <Typography variant='body1'>
          <strong>Model data.</strong> Models you open are processed locally in your browser using WebAssembly.
          If you connect third-party storage (e.g., Google Drive), we only request access to the specific files
          you select. We do not scan or store other files from your account.
        </Typography>
        <Typography variant='body1'>
          <strong>Telemetry (optional).</strong> If enabled in a hosted deployment, we may collect anonymized
          usage metrics (e.g., performance, feature use) to improve reliability and UX.
        </Typography>

        <Typography variant='h1'>2. Open-Source and Self-Hosted Use</Typography>
        <Typography variant='body1'>
          Most of our codebase (including Bldrs Share and Conway) is available under the
          <strong> GNU Affero General Public License (AGPL)</strong> on GitHub. If you deploy or modify our
          software, you are responsible for complying with applicable privacy laws and for communicating your
          own deployment’s data-handling practices to your users.
        </Typography>

        <Typography variant='h1'>3. How We Use Information</Typography>
        <Typography variant='body1'>
          We use limited account and usage data to authenticate users; enable integrations (e.g., importing from
          Google Drive); improve performance, security, and usability; and communicate important service updates.
        </Typography>

        <Typography variant='h1'>4. Data Storage and Security</Typography>
        <Typography variant='body1'>
          <strong>No persistent model storage by default.</strong> Model data is processed client-side and is not
          uploaded to our servers. Communication between your browser and our services uses HTTPS. Future, optional
          hosted collaboration features (e.g., Firestore for comments/sharing) may store limited user-generated
          data; if launched, this policy will be updated accordingly.
        </Typography>

        <Typography variant='h1'>5. Google User Data</Typography>
        <Typography variant='body1'>
          Our use of Google user data complies with the{' '}
          <Link href='https://developers.google.com/terms/api-services-user-data-policy' target='_blank' rel='noopener'>
            Google API Services User Data Policy
          </Link>
          , including Limited Use requirements. Access to Google Drive is used solely to open or save the files that
          you explicitly select.
        </Typography>

        <Typography variant='h1'>6. Your Choices</Typography>
        <Typography variant='body1'>
          You can disconnect Google access in your Google Account settings. You may request deletion of any stored
          account metadata (if applicable) by emailing <Link href='mailto:support@bldrs.ai'>support@bldrs.ai</Link>.
          You can also use open-source/self-hosted deployments without accounts, subject to your configuration.
        </Typography>

        <Typography variant='h1'>7. Children’s Privacy</Typography>
        <Typography variant='body1'>
          Our services are not directed to children under 13, and we do not knowingly collect personal information
          from them.
        </Typography>

        <Typography variant='h1'>8. Updates</Typography>
        <Typography variant='body1'>
          We may update this Privacy Policy as our services evolve. The “Last Updated” date will reflect the most
          recent changes.
        </Typography>

        <Typography variant='h1'>9. Contact</Typography>
        <Typography variant='body1'>
          Questions or privacy requests? Email{' '}
          <Link href='mailto:support@bldrs.ai'>support@bldrs.ai</Link> or visit{' '}
          <Link href='https://bldrs.ai' target='_blank' rel='noopener'>https://bldrs.ai</Link>.
        </Typography>
      </Box>
    </TitledLayout>
  )
}
