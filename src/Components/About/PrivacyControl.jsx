import React, {ReactElement, useEffect, useState} from 'react'
import {Stack, Typography, Link} from '@mui/material'
import * as Analytics from '../../privacy/analytics'
import Toggle from '../Toggle'


/**
 * The PrivacyControl component contains and "accept analytics" checkbox.
 *
 * @return {ReactElement}
 */
export default function PrivacyControl() {
  const [isAnalyticsEnabled, setIsAnalyticsEnabled] = useState(true)

  useEffect(() => {
    setIsAnalyticsEnabled(Analytics.isAllowed())
  }, [])

  const togglePrivacy = () => {
    const newVal = !isAnalyticsEnabled
    setIsAnalyticsEnabled(newVal)
    Analytics.setIsAllowed(newVal)
  }

  return (
    <Stack
      spacing={2}
      direction="row"
      justifyContent="space-around"
      alignItems="center"
    >
      <Stack
        spacing={0}
        direction="column"
        justifyContent="flex-start"
        alignItems="flex-start"
      >
        <Typography>Analytics cookies</Typography>
        <Link href='https://github.com/bldrs-ai/Share/wiki/Design#privacy' color='inherit' variant='overline'>
          read more
        </Link>
      </Stack>
      <Toggle checked={isAnalyticsEnabled} onChange={togglePrivacy}/>
    </Stack>
  )
}
