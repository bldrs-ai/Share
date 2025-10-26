import React, {ReactElement} from 'react'
import Typography from '@mui/material/Typography'
import TitledLayout from '../layouts/TitledLayout'


/** @return {ReactElement} */
export default function About() {
  return (
    <TitledLayout title='About Bldrs'>
      <Typography variant='p'>
        The Architecture, Engineering and Construction industries are trying to face
        challenging problems of the future with tools anchored in the past. Meanwhile,
        a new dynamic has propelled the Tech industry: online, collaborative,
        open development.
      </Typography>
      <Typography variant='p'>
        We can&apos;t imagine a future where building the rest of the world hasn&apos;t been
        transformed by these new ways of working. We are part of that transformation.
      </Typography>
      <Typography variant='p'>
        The key insights from Tech. Cross-functional online collaboration unlocks team flow,
        productivity and creativity. Your team extends outside of your organization and
        software developers are essential team members. An ecosystem of app Creators developing on
        a powerful operating system. Platform is the most scalable architecture. Open workspaces,
        open standards and open source code the most powerful way to work. Cooperation is the
        unfair advantage.
      </Typography>
      <Typography variant='p'>
        Smarter Building Together
      </Typography>
    </TitledLayout>
  )
}
