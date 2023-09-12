import React, {useEffect, useState} from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import * as Privacy from '../../privacy/Privacy'
import Toggle from '../Toggle'


/**
 * The PrivacyControl component contains and "accept cookies" checkbox.
 *
 * @return {React.ReactElement}
 */
export default function PrivacyControl() {
  const [acceptCookies, setAcceptCookies] = useState(true)


  useEffect(() => {
    if (Privacy.isPrivacySocialEnabled()) {
      setAcceptCookies(true)
    } else {
      setAcceptCookies(false)
    }
  }, [])

  const changePrivacy = () => {
    setPrivacy(acceptCookies)
    setAcceptCookies(!acceptCookies)
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
        <Link href='https://github.com/bldrs-ai/Share/wiki/Design#privacy' >
          read more
        </Link>
      </Stack>
      <Toggle checked={acceptCookies} onChange={changePrivacy}/>
    </Stack>
  )
}


export const setPrivacy = (acceptCookies) => {
  if (acceptCookies) {
    Privacy.setUsageAndSocialEnabled(false, false)
  } else {
    Privacy.setUsageAndSocialEnabled(true, true)
  }
}
