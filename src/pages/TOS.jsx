import React, {ReactElement} from 'react'
import {Typography, Link, Box} from '@mui/material'
import TitledLayout from '../layouts/TitledLayout'


/** @return {ReactElement} */
export default function Terms() {
  return (
    <TitledLayout title='Terms of Service'>
      <Box sx={{display: 'grid'}}>
        <Typography variant='body1'><strong>Effective Date:</strong> January 1, 2022</Typography>
        <Typography variant='body1'><strong>Last Updated:</strong> October 23, 2025</Typography>

        <Typography variant='body1'>
          Welcome to Bldrs Share (“Service”). By accessing or using the Service or related open-source code,
          you agree to these Terms.
        </Typography>

        <Typography variant='h1'>1. Description of Service</Typography>
        <Typography variant='body1'>
          Bldrs Share provides browser-based tools for viewing and collaborating on 3D model files. You may
          use our hosted instance at <Link href='https://bldrs.ai' target='_blank' rel='noopener'>bldrs.ai</Link> or
          deploy self-hosted instances.
        </Typography>

        <Typography variant='h1'>2. Open Source Licensing</Typography>
        <Typography variant='body1'>
          Most components of Bldrs Share and the Conway Engine are licensed under the{' '}
          <strong>GNU AGPL</strong>. If you host or distribute modified versions, you must make source code
          available under the same license. Certain proxy/connectors may be under separate licenses.
        </Typography>

        <Typography variant='h1'>3. Your Responsibilities</Typography>
        <Typography variant='body1'>
          You agree to use the Service lawfully; not infringe others’ rights; maintain account security; and ensure
          that any data you upload or share is permitted. For self-hosted deployments, you are solely responsible for
          your own infrastructure, security, and privacy practices.
        </Typography>

        <Typography variant='h1'>4. Intellectual Property</Typography>
        <Typography variant='body1'>
          Bldrs trademarks, the Conway Engine, and related technology are owned by Bldrs, Inc. and contributors.
          You retain ownership of the 3D models and content you load into the Service.
        </Typography>

        <Typography variant='h1'>5. Data Handling and Hosting</Typography>
        <Typography variant='body1'>
          By default, we do not persist model data on our servers; processing occurs in your browser. Future optional
          hosted features (e.g., Firestore for sharing) may store limited collaboration data; these terms and privacy
          documentation will be updated accordingly.
        </Typography>

        <Typography variant='h1'>6. Third-Party Services</Typography>
        <Typography variant='body1'>
          Integrations (e.g., Google Drive) are provided “as is” and are governed by those providers’ terms. You are
          responsible for complying with third-party terms when enabling integrations.
        </Typography>

        <Typography variant='h1'>7. Warranty Disclaimer</Typography>
        <Typography variant='body1'>
          The Service is provided “as is” and “as available,” without warranties of any kind, express or implied,
          including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee
          uninterrupted or error-free operation.
        </Typography>

        <Typography variant='h1'>8. Limitation of Liability</Typography>
        <Typography variant='body1'>
          To the fullest extent permitted by law, Bldrs shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages, or for lost profits, data, or business, arising from or related to use
          of the Service.
        </Typography>

        <Typography variant='h1'>9. Modifications</Typography>
        <Typography variant='body1'>
          We may update these Terms from time to time. Changes take effect upon posting. Your continued use of the
          Service constitutes acceptance of the updated Terms.
        </Typography>

        <Typography variant='h1'>10. Governing Law</Typography>
        <Typography variant='body1'>
          These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-law rules.
        </Typography>

        <Typography variant='h1'>11. Contact</Typography>
        <Typography variant='body1'>
          Questions? Email <Link href='mailto:support@bldrs.ai'>support@bldrs.ai</Link> or visit{' '}
          <Link href='https://bldrs.ai' target='_blank' rel='noopener'>https://bldrs.ai</Link>.
        </Typography>
      </Box>
    </TitledLayout>
  )
}
