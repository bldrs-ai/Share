import React, {ReactElement} from 'react'
import {Box, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography} from '@mui/material'
import TitledLayout from '../../layouts/TitledLayout'
import {LIMITS, ROLLING_WINDOW_DAYS, TIERS} from '../../quota/limits'


/** @return {ReactElement} */
export default function Quotas() {
  return (
    <TitledLayout title='Bldrs Share: Usage limits'>
      <Box sx={{maxWidth: 720, margin: '0 auto', padding: '1em'}}>
        <Typography variant='h4' gutterBottom>Usage limits</Typography>
        <Typography paragraph>
          Bldrs Share counts the <em>private</em> models you open from the
          cloud. A model is private when you can see it only because the
          provider lets <em>you</em> in: you are a member of its private
          GitHub repository, or its Google Drive file is shared with your
          Google account. Files from your own computer, public GitHub models
          and Drive files shared &ldquo;Anyone with the link&rdquo; are free
          and unlimited to view. Each private model you open holds one of
          your model slots for {ROLLING_WINDOW_DAYS} days, and the same slots
          cover GLB exports (below).
        </Typography>

        <Table sx={{marginTop: '1em'}}>
          <TableHead>
            <TableRow>
              <TableCell><strong>Tier</strong></TableCell>
              <TableCell><strong>Model slots</strong></TableCell>
              <TableCell><strong>Window</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>Signed out</TableCell>
              <TableCell>Not counted</TableCell>
              <TableCell>—</TableCell>
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

        <Typography variant='h6' sx={{marginTop: '1.5em'}}>What does <em>not</em> count when you open it?</Typography>
        <Typography component='ul'>
          <li>Files opened from your computer (drag and drop, or Browse)</li>
          <li>Public GitHub repositories (including all sample models)</li>
          <li>Google Drive files shared &ldquo;Anyone with the link&rdquo;</li>
          <li>Anything you open while signed out</li>
          <li>Browsing the model viewer itself, navigation, search, etc.</li>
        </Typography>

        <Typography variant='h6' sx={{marginTop: '1.5em'}}>GLB exports</Typography>
        <Typography paragraph data-testid='quotas-exports'>
          Exports use the same {LIMITS[TIERS.FREE]} model slots. Export a
          model that holds one of your slots as often as you like. A model
          that holds no slot yet &mdash; a file from your computer, a public
          GitHub model, a link-shared Drive file &mdash; takes one the first
          time you export it, and is then yours to export freely for the rest
          of the {ROLLING_WINDOW_DAYS} days. When every slot holds another
          model, exporting a new one waits until the oldest slot frees up.
        </Typography>

        <Typography sx={{marginTop: '2em'}}>
          Need more? <Link href='/subscribe'>Upgrade to Pro</Link> for
          unlimited private models and exports.
        </Typography>
      </Box>
    </TitledLayout>
  )
}
