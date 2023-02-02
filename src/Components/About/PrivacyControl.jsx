import React, {useEffect, useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
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
    <Box
      sx={{
        width: '100%',
        margin: '1em 0',
        textAlign: 'justify',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Typography>
        Analytics cookies<br/>
        <a href='https://github.com/bldrs-ai/Share/wiki/Design#privacy' target='_new'>
          read more
        </a>
      </Typography>
      <Toggle checked={acceptCookies} onChange={changePrivacy}/>
    </Box>
  )
}


export const setPrivacy = (acceptCookies) => {
  if (acceptCookies) {
    Privacy.setUsageAndSocialEnabled(false, false)
  } else {
    Privacy.setUsageAndSocialEnabled(true, true)
  }
}
