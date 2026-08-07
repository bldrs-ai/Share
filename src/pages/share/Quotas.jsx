import React, {ReactElement} from 'react'
import {Box, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography} from '@mui/material'
import TitledLayout from '../../layouts/TitledLayout'


/** @return {ReactElement} */
export default function Quotas() {
  return (
    <TitledLayout title='Bldrs Share: Usage limits'>
      <Box sx={{maxWidth: 720, margin: '0 auto', padding: '1em'}}>
        <Typography variant='h4' gutterBottom>Usage limits</Typography>
        <Typography paragraph>
          Bldrs Share counts loads of <em>private</em> models — files in
          your local browser storage, files from your Google Drive, and
          private GitHub repositories. Public GitHub samples and shared
          public-repo models do not count.
        </Typography>

        <Table sx={{marginTop: '1em'}}>
          <TableHead>
            <TableRow>
              <TableCell><strong>Tier</strong></TableCell>
              <TableCell><strong>Private model loads</strong></TableCell>
              <TableCell><strong>Window</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>Anonymous</TableCell>
              <TableCell>2</TableCell>
              <TableCell>Lifetime — sign in to reset</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Free (signed in)</TableCell>
              <TableCell>4</TableCell>
              <TableCell>Rolling 30 days</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Pro</TableCell>
              <TableCell>Unlimited</TableCell>
              <TableCell>—</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <Typography variant='h6' sx={{marginTop: '2em'}}>What counts as a load?</Typography>
        <Typography paragraph>
          Each unique private model URL counts once. Reloading the same
          model — via the browser back button, your recently-used list,
          or a fresh tab — does not consume additional quota.
        </Typography>

        <Typography variant='h6' sx={{marginTop: '1.5em'}}>What does <em>not</em> count?</Typography>
        <Typography component='ul'>
          <li>Public GitHub repositories (including all sample models)</li>
          <li>Browsing the model viewer itself, navigation, search, etc.</li>
          <li>Loads while offline (they will sync when you reconnect)</li>
        </Typography>

        <Typography sx={{marginTop: '2em'}}>
          Need more? <Link href='/subscribe'>Upgrade to Pro</Link> for
          unlimited private model loads.
        </Typography>
      </Box>
    </TitledLayout>
  )
}
