import React, {ReactElement} from 'react'
import {Box, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography} from '@mui/material'
import TitledLayout from '../../layouts/TitledLayout'
import {FREE_EXPORT_LIMIT, FREE_EXPORT_WINDOW_DAYS} from '../../export/freeExports'
import {LIMITS, ROLLING_WINDOW_DAYS, TIERS} from '../../quota/limits'


/** @return {ReactElement} */
export default function Quotas() {
  return (
    <TitledLayout title='Bldrs Share: Usage limits'>
      <Box sx={{maxWidth: 720, margin: '0 auto', padding: '1em'}}>
        <Typography variant='h4' gutterBottom>Usage limits</Typography>
        <Typography paragraph>
          Bldrs Share counts the <em>private</em> models you open from the
          cloud: files from your Google Drive and from private GitHub
          repositories. Files from your own computer and public GitHub
          models are free and unlimited.
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
              <TableCell>{LIMITS[TIERS.ANONYMOUS]}</TableCell>
              <TableCell>Lifetime — sign in to reset</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Free (signed in)</TableCell>
              <TableCell>{LIMITS[TIERS.FREE]}</TableCell>
              <TableCell>Rolling {ROLLING_WINDOW_DAYS} days</TableCell>
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
          <li>Files opened from your computer (drag and drop, or Browse)</li>
          <li>Public GitHub repositories (including all sample models)</li>
          <li>Browsing the model viewer itself, navigation, search, etc.</li>
        </Typography>

        <Typography variant='h6' sx={{marginTop: '1.5em'}}>GLB exports</Typography>
        <Typography paragraph>
          A free account includes {FREE_EXPORT_LIMIT} GLB exports in any
          rolling {FREE_EXPORT_WINDOW_DAYS} days.
        </Typography>

        <Typography sx={{marginTop: '2em'}}>
          Need more? <Link href='/subscribe'>Upgrade to Pro</Link> for
          unlimited private models and unlimited GLB exports.
        </Typography>
      </Box>
    </TitledLayout>
  )
}
