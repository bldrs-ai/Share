import type {Metadata} from 'next'
import {Card, CardContent, Grid, Typography} from '@mui/material'
import PageShell from '@/components/PageShell'
import {OG_IMAGE, SITE_NAME, SITE_URL} from '@/lib/site'


const TITLE = 'About Bldrs'
const DESCRIPTION =
  'Bldrs.ai is a browser-first BIM & CAD collaboration platform powered by ' +
  'the open-source Conway engine. We bring the cross-functional, real-time ' +
  'collaboration of modern tech to the world that builds.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {canonical: '/about'},
  openGraph: {
    title: `${TITLE} — ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/about`,
    type: 'website',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} — ${SITE_NAME}`,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
}


const PILLARS = [
  {
    title: 'Browser-first collaboration',
    body:
      'Current CAD tooling is anchored in desktop apps and proprietary formats. ' +
      'Bldrs brings the cross-functional, real-time, version-controlled workflow ' +
      'that Google Docs and GitHub established to the world that builds.',
  },
  {
    title: 'Open standards, open source',
    body:
      'IFC and STEP, parsed and rendered by the Conway engine — fully open-source under AGPL. ' +
      'No proprietary file lock-in, no opaque cloud pipeline.',
  },
  {
    title: 'Designed for AI',
    body:
      'A clean separation between geometry, semantics, and UI means AI assistants ' +
      'can drive Bldrs directly — querying models, generating views, and surfacing ' +
      'issues across team boundaries.',
  },
]


export default function AboutPage() {
  // JSON-LD for the marketing surface. Crawlers reading the static export
  // pick this up alongside the OG meta tags.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': SITE_NAME,
    'applicationCategory': 'DesignApplication',
    'operatingSystem': 'Web Browser',
    'description': DESCRIPTION,
    'url': SITE_URL,
    'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
  }
  return (
    <PageShell title={TITLE}>
      {/* JSON-LD as a plain inline <script> — next/script's beforeInteractive
          strategy only works in the root layout under App Router, so page-level
          structured data has to bypass it. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />

      <Typography variant="body1">
        The Architecture, Engineering and Construction industries are trying to face
        challenging problems of the future with tools anchored in the past. Meanwhile,
        a new dynamic has propelled the Tech industry: online, collaborative,
        open development. We can&apos;t imagine a future where building the rest of
        the world hasn&apos;t been transformed by these new ways of working. We are
        part of that transformation.
      </Typography>

      <Typography variant="body1">
        Cross-functional online collaboration unlocks team flow, productivity and
        creativity. Your team extends outside of your organization and software
        developers are essential team members. Open workspaces, open standards
        and open source code are the most powerful way to work. Cooperation is the
        unfair advantage.
      </Typography>

      <Grid container spacing={3} sx={{mt: 2}}>
        {PILLARS.map((p) => (
          <Grid item xs={12} md={4} key={p.title}>
            <Card variant="outlined" sx={{height: '100%', bgcolor: 'background.paper'}}>
              <CardContent>
                <Typography variant="h4" component="h2" gutterBottom>
                  {p.title}
                </Typography>
                <Typography variant="body2" sx={{opacity: 0.85}}>
                  {p.body}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="body1" sx={{mt: 4, fontWeight: 700}}>
        Smarter Building Together.
      </Typography>
    </PageShell>
  )
}
