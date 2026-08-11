import Link from 'next/link'
import {Button, Typography} from '@mui/material'
import PageShell from '@/components/PageShell'


export default function BlogPostNotFound() {
  return (
    <PageShell title="Post not found">
      <Typography variant="body1" sx={{mb: 3}}>
        That post isn&apos;t here. It may have been moved or renamed.
      </Typography>
      <Button component={Link} href="/blog" variant="outlined">
        Back to the blog
      </Button>
    </PageShell>
  )
}
