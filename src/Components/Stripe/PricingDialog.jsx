// PricingDialog.js
import React, {ReactElement} from 'react'
import {Dialog, AppBar, Toolbar, IconButton, Typography} from '@mui/material'
import {Close as CloseIcon} from '@mui/icons-material'
import PricingTable from '../Stripe/PricingTable'


/**
 * PricingDialog returns the Stripe pricing dialog
 *
 * @return {ReactElement}
 */
export default function PricingDialog({openPricing, handleClosePricing, isDay}) {
  return (
    <Dialog
      open={openPricing}
      onClose={handleClosePricing}
      // Remove fullScreen so we can control width & height
      fullScreen={false}
      // Let MUI handle widths up to md (960px). You can pick "sm", "md", "lg", etc.
      maxWidth="md"
      // Allow the dialog to grow to maxWidth
      fullWidth
      // Control height via PaperProps
      PaperProps={{
        sx: {
          // For example, limit the height to 90% of the viewport.
          maxHeight: '90vh',
          // Optionally set a minimum height so the iframe has enough space
          minHeight: '500px',
        },
      }}
    >
      <AppBar sx={{position: 'relative'}}>
        <Toolbar sx={{position: 'relative'}}>
          {/* Absolutely‐positioned icon on the left */}
          <IconButton
            edge='start'
            color='inherit'
            onClick={handleClosePricing}
            aria-label='close'
            sx={{
              position: 'absolute',
              left: 0,
            }}
          >
            <CloseIcon/>
          </IconButton>

          {/* Centered title in a 100%-width container */}
          <Typography
            variant='h3'
            sx={{
              width: '100%',
              textAlign: 'center',
            }}
          >
          Manage Subscription
          </Typography>
        </Toolbar>
      </AppBar>

      {/* The Stripe Pricing Table. May grow to fill available width/height */}
      <PricingTable theme={isDay ? 'light' : 'dark'}/>
    </Dialog>
  )
}
