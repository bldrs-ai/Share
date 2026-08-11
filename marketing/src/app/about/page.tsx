import type {Metadata} from 'next'
import Link from 'next/link'
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Grid,
  Stack,
  Typography,
} from '@mui/material'
import BoltIcon from '@mui/icons-material/Bolt'
import BusinessIcon from '@mui/icons-material/Business'
import GitHubIcon from '@mui/icons-material/GitHub'
import PublicIcon from '@mui/icons-material/Public'
import SpeedIcon from '@mui/icons-material/Speed'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import {OG_IMAGE, SITE_NAME, SITE_URL, SOCIAL} from '@/lib/site'
import {CYAN, LIME, LIME_HOVER} from '@/lib/theme'


const TITLE = 'About Bldrs.ai — AI-Powered Digital Twin Collaboration Platform'
const DESCRIPTION =
  "Bldrs.ai is the world's fastest browser-based CAD viewer and " +
  'collaboration platform powered by AI. We are transforming how ' +
  'imagination becomes reality with Digital Twins and intelligent assistance.'

export const metadata: Metadata = {
  title: 'About',
  description: DESCRIPTION,
  keywords: [
    'Bldrs.ai',
    'Digital Twins',
    'AI CAD',
    'IFC viewer',
    'STEP viewer',
    'open standards',
    'GitHub CAD',
    'collaborative engineering',
    'manufacturing',
    'AEC',
    'Industry 4.0',
  ],
  alternates: {canonical: '/about'},
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/about`,
    type: 'website',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: "The world's fastest browser-based CAD viewer for Digital Twin collaboration.",
    images: [OG_IMAGE],
  },
}


const SOLUTION_CARDS = [
  {
    Icon: BusinessIcon,
    color: LIME,
    title: 'Modern Collaboration Platform',
    body:
      'Current CAD tooling is stuck in the dark ages. Google Docs, GitHub, and ' +
      "Figma have shown what users want. We're bringing that same level of " +
      'collaboration to Digital Twins.',
  },
  {
    Icon: BoltIcon,
    color: CYAN,
    title: 'AI-Powered Interface',
    body:
      'AI Coding and Assistants replace thousands of buttons with a flexible, ' +
      'task-oriented natural language interface. Build anything with a prompt.',
  },
  {
    Icon: PublicIcon,
    color: LIME,
    title: 'Built for the Future',
    body:
      'Frontier models will soon use sophisticated computational engineering tools ' +
      'and physics models to create truly advanced technologies.',
  },
]

const SHARE_FEATURES = [
  'Web-based model view and collaboration',
  'Fastest IFC & STEP engine',
  'Versioning & Issues with GitHub',
  'Complete in-browser data sovereignty',
  'Frictionless onboarding with no signup required',
]

const AI_FEATURES = [
  'Full IFC & STEP APIs',
  'AI Assistant for CAD with natural language interface',
  'AI-powered app creation for specialized tasks',
]

const PERFORMANCE_STATS = [
  {value: '32s', color: LIME, label: 'Load 860MB IFC file', detail: 'In-browser, no upload required'},
  {value: '8s', color: CYAN, label: 'Load 110MB STEP file', detail: 'Progressive web app'},
]


export default function AboutPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': 'Bldrs Share',
    'applicationCategory': 'DesignApplication',
    'operatingSystem': 'Web Browser',
    'description': DESCRIPTION,
    'url': SITE_URL,
    'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
  }

  return (
    <Box sx={{minHeight: '100vh', display: 'flex', flexDirection: 'column'}}>
      <SiteNav/>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />

      <Box component="main" sx={{flex: 1}}>
        {/* Hero */}
        <Box sx={{
          py: {xs: 8, md: 14},
          textAlign: 'center',
          background: `linear-gradient(180deg, rgba(0,240,255,0.05) 0%, transparent 60%)`,
        }}>
          <Container maxWidth="md">
            <Typography variant="overline" sx={{color: LIME, display: 'block', textTransform: 'uppercase', mb: 2}}>
              Smarter Building Together
            </Typography>
            <Typography variant="h2" component="h1" sx={{fontWeight: 800, mb: 3}}>
              Tomorrow&apos;s innovations won&apos;t start with a drawing.{' '}
              <Box component="span" sx={{color: CYAN}}>They will start with a prompt.</Box>
            </Typography>
            <Typography variant="body1" sx={{mb: 2, opacity: 0.85, maxWidth: 680, mx: 'auto', fontSize: {xs: '1rem', md: '1.15rem'}, lineHeight: 1.8}}>
              Bldrs.ai is the world&apos;s fastest browser-based CAD viewer and
              collaboration platform, powered by AI. We&apos;re building the future
              where Digital Twins and artificial intelligence transform how
              imagination becomes reality.
            </Typography>
            <Typography variant="body1" sx={{mb: 4, opacity: 0.85, maxWidth: 680, mx: 'auto', fontSize: {xs: '1rem', md: '1.15rem'}, lineHeight: 1.8}}>
              Think AI + GitHub for CAD. We enable teams to collaborate on Digital
              Twin engineering data with unprecedented speed, open standards, and
              intelligent assistance.
            </Typography>
            <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} justifyContent="center">
              <Button
                href={SOCIAL.sales}
                variant="contained"
                size="large"
                sx={{bgcolor: LIME, color: '#000', fontWeight: 700, px: 4, py: 1.5, fontSize: '1.1rem', '&:hover': {bgcolor: LIME_HOVER}}}
              >
                Contact Us
              </Button>
              <Button
                component={Link}
                href="/services"
                variant="outlined"
                size="large"
                sx={{borderColor: 'rgba(255,255,255,0.3)', color: 'inherit', fontWeight: 600, px: 4, py: 1.5, fontSize: '1.1rem', '&:hover': {borderColor: CYAN, color: CYAN}}}
              >
                Our Services
              </Button>
            </Stack>
          </Container>
        </Box>

        {/* Solution */}
        <Box sx={{py: {xs: 8, md: 10}}}>
          <Container maxWidth="lg">
            <Box sx={{textAlign: 'center', mb: 6}}>
              <Typography variant="overline" sx={{color: LIME}}>Our Solution</Typography>
            </Box>
            <Grid container spacing={3}>
              {SOLUTION_CARDS.map(({Icon, color, title, body}) => (
                <Grid item xs={12} md={4} key={title}>
                  <Card sx={{
                    height: '100%',
                    bgcolor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    transition: 'border-color 0.2s',
                    '&:hover': {borderColor: 'rgba(0,240,255,0.3)'},
                  }}>
                    <CardContent sx={{p: 3}}>
                      <Box sx={{mb: 2}}><Icon sx={{fontSize: 40, color}}/></Box>
                      <Typography variant="h6" sx={{fontWeight: 600, mb: 1}}>{title}</Typography>
                      <Typography variant="body2" sx={{opacity: 0.7, lineHeight: 1.7}}>{body}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Features split */}
        <Box sx={{
          py: {xs: 8, md: 10},
          borderTop: '1px solid rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <Container maxWidth="lg">
            <Grid container spacing={6}>
              <Grid item xs={12} md={6}>
                <Typography variant="overline" sx={{color: LIME}}>Bldrs Share</Typography>
                <Typography variant="h4" sx={{fontWeight: 700, mt: 1, mb: 3}}>Key Features</Typography>
                <Stack spacing={1.5}>
                  {SHARE_FEATURES.map((feature) => (
                    <Stack key={feature} direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{width: 6, height: 6, borderRadius: '50%', bgcolor: LIME, flexShrink: 0}}/>
                      <Typography variant="body1" sx={{opacity: 0.85}}>{feature}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="overline" sx={{color: CYAN}}>AI Foundations</Typography>
                <Typography variant="h4" sx={{fontWeight: 700, mt: 1, mb: 3}}>Intelligent Tools</Typography>
                <Stack spacing={1.5}>
                  {AI_FEATURES.map((feature) => (
                    <Stack key={feature} direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{width: 6, height: 6, borderRadius: '50%', bgcolor: CYAN, flexShrink: 0}}/>
                      <Typography variant="body1" sx={{opacity: 0.85}}>{feature}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Performance */}
        <Box sx={{py: {xs: 8, md: 10}}}>
          <Container maxWidth="md" sx={{textAlign: 'center'}}>
            <SpeedIcon sx={{fontSize: 48, color: LIME, mb: 2}}/>
            <Typography variant="h3" sx={{fontWeight: 700, mb: 1}}>Industry-Leading Performance</Typography>
            <Typography variant="h6" sx={{opacity: 0.6, mb: 5, fontWeight: 400}}>Fast is our Favorite Feature</Typography>
            <Grid container spacing={4} justifyContent="center" sx={{mb: 3}}>
              {PERFORMANCE_STATS.map((stat) => (
                <Grid item xs={12} sm={6} key={stat.label}>
                  <Card sx={{bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', py: 3}}>
                    <CardContent>
                      <Typography variant="h2" sx={{fontWeight: 800, color: stat.color, fontSize: '3rem', mb: 1}}>
                        {stat.value}
                      </Typography>
                      <Typography variant="h6" sx={{fontWeight: 600, mb: 0.5}}>{stat.label}</Typography>
                      <Typography variant="body2" sx={{opacity: 0.5}}>{stat.detail}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
            <Typography variant="body2" sx={{opacity: 0.5, fontStyle: 'italic'}}>
              Compared to competitors taking 173–990 seconds for similar files
            </Typography>
          </Container>
        </Box>

        {/* CTA */}
        <Box sx={{
          py: {xs: 8, md: 10},
          textAlign: 'center',
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,255,0,0.05) 100%)',
        }}>
          <Container maxWidth="sm">
            <Typography variant="h3" sx={{fontWeight: 700, mb: 2}}>Ready to Transform Your Workflow?</Typography>
            <Typography variant="body1" sx={{opacity: 0.8, mb: 4, lineHeight: 1.8}}>
              Let&apos;s discuss how Bldrs.ai can accelerate your Digital Twin initiatives
              and unlock new capabilities for your team.
            </Typography>
            <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} justifyContent="center">
              <Button
                href={SOCIAL.sales}
                variant="contained"
                size="large"
                sx={{bgcolor: LIME, color: '#000', fontWeight: 700, px: 4, py: 1.5, '&:hover': {bgcolor: LIME_HOVER}}}
              >
                Contact Us
              </Button>
              <Button
                component={Link}
                href="/services"
                variant="outlined"
                size="large"
                sx={{borderColor: 'rgba(255,255,255,0.3)', color: 'inherit', fontWeight: 600, px: 4, py: 1.5, '&:hover': {borderColor: LIME, color: LIME}}}
              >
                View Services
              </Button>
            </Stack>
          </Container>
        </Box>

        {/* Join the Revolution */}
        <Box sx={{
          py: {xs: 6, md: 8},
          textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          <Container maxWidth="md">
            <Typography variant="h5" sx={{fontWeight: 600, mb: 2}}>Join the Revolution</Typography>
            <Typography variant="body1" sx={{opacity: 0.7, mb: 3, maxWidth: 600, mx: 'auto'}}>
              We&apos;re building the future of Digital Twin collaboration with Industry 4.0
              technology, powering the next generation of engineering and smart manufacturing.
            </Typography>
            <Stack direction="row" spacing={3} justifyContent="center">
              <Button
                href={SOCIAL.github}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<GitHubIcon/>}
                sx={{color: 'inherit', '&:hover': {color: LIME}}}
              >
                GitHub
              </Button>
              <Button
                href={SOCIAL.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                sx={{color: 'inherit', '&:hover': {color: LIME}}}
              >
                LinkedIn
              </Button>
              <Button
                href={SOCIAL.twitter}
                target="_blank"
                rel="noopener noreferrer"
                sx={{color: 'inherit', '&:hover': {color: LIME}}}
              >
                Twitter
              </Button>
            </Stack>
          </Container>
        </Box>
      </Box>

      <SiteFooter/>
    </Box>
  )
}
