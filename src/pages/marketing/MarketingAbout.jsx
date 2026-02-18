import React, {ReactElement} from 'react'
import {Link as RouterLink} from 'react-router-dom'
import {Helmet} from 'react-helmet-async'
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
import {
  Bolt as BoltIcon,
  Business as BusinessIcon,
  GitHub as GitHubIcon,
  Public as PublicIcon,
  Rocket as RocketIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material'
import MarketingLayout from './MarketingLayout'


const SOLUTION_CARDS = [
  {
    icon: <BusinessIcon sx={{fontSize: 40, color: 'lime'}}/>,
    title: 'Modern Collaboration Platform',
    description: 'Current CAD tooling is stuck in the dark ages. Google Docs, GitHub, and Figma have shown what users want. We\'re bringing that same level of collaboration to Digital Twins.',
  },
  {
    icon: <BoltIcon sx={{fontSize: 40, color: '#00F0FF'}}/>,
    title: 'AI-Powered Interface',
    description: 'AI Coding and Assistants replace thousands of buttons with a flexible, task-oriented natural language interface. Build anything with a prompt.',
  },
  {
    icon: <PublicIcon sx={{fontSize: 40, color: 'lime'}}/>,
    title: 'Built for the Future',
    description: 'Frontier models will soon use sophisticated computational engineering tools and physics models to create truly advanced technologies.',
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
  {value: '32s', label: 'Load 860MB IFC file', detail: 'In-browser, no upload required'},
  {value: '8s', label: 'Load 110MB STEP file', detail: 'Progressive web app'},
]


/**
 * Marketing About/Landing page.
 *
 * @return {ReactElement}
 */
export default function MarketingAbout() {
  return (
    <MarketingLayout>
      <Helmet>
        <title>About Bldrs.ai - AI-Powered Digital Twin Collaboration Platform</title>
        <meta name="description" content="Bldrs.ai is the world's fastest browser-based CAD viewer and collaboration platform powered by AI. We're transforming how imagination becomes reality with Digital Twins and intelligent assistance."/>
        <meta name="keywords" content="Bldrs.ai, Digital Twins, AI CAD, IFC viewer, STEP viewer, open standards, GitHub CAD, collaborative engineering, manufacturing, AEC, Industry 4.0"/>
        <meta property="og:title" content="About Bldrs.ai - AI-Powered Digital Twin Collaboration Platform"/>
        <meta property="og:description" content="The world's fastest browser-based CAD viewer and collaboration platform powered by AI."/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://bldrs.ai/about"/>
        <meta name="twitter:card" content="summary_large_image"/>
        <meta name="twitter:title" content="About Bldrs.ai - AI-Powered Digital Twin Collaboration Platform"/>
        <meta name="twitter:description" content="The world's fastest browser-based CAD viewer for Digital Twin collaboration."/>
        <link rel="canonical" href="https://bldrs.ai/about"/>
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          'name': 'Bldrs Share',
          'applicationCategory': 'DesignApplication',
          'operatingSystem': 'Web Browser',
          'description': 'The world\'s fastest browser-based CAD viewer and collaboration platform powered by AI.',
          'url': 'https://bldrs.ai',
          'offers': {
            '@type': 'Offer',
            'price': '0',
            'priceCurrency': 'USD',
          },
        })}</script>
      </Helmet>

      {/* Hero Section */}
      <Box sx={{
        py: {xs: 8, md: 14},
        textAlign: 'center',
        background: 'linear-gradient(180deg, rgba(0,240,255,0.05) 0%, transparent 60%)',
      }}>
        <Container maxWidth="md">
          <Typography
            variant="h6"
            sx={{color: 'lime', fontWeight: 700, mb: 2, letterSpacing: 2, textTransform: 'uppercase'}}
          >
            Smarter Building Together
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              mb: 3,
              fontSize: {xs: '2.2rem', md: '3.5rem'},
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            Tomorrow&apos;s innovations won&apos;t start with a drawing.{' '}
            <Box component="span" sx={{color: '#00F0FF'}}>
              They will start with a prompt.
            </Box>
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 2,
              opacity: 0.85,
              maxWidth: 680,
              mx: 'auto',
              fontSize: {xs: '1rem', md: '1.15rem'},
              lineHeight: 1.8,
            }}
          >
            Bldrs.ai is the world&apos;s fastest browser-based CAD viewer and collaboration platform,
            powered by AI. We&apos;re building the future where Digital Twins and artificial intelligence
            transform how imagination becomes reality.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 4,
              opacity: 0.85,
              maxWidth: 680,
              mx: 'auto',
              fontSize: {xs: '1rem', md: '1.15rem'},
              lineHeight: 1.8,
            }}
          >
            Think AI + GitHub for CAD. We enable teams to collaborate on Digital Twin engineering
            data with unprecedented speed, open standards, and intelligent assistance.
          </Typography>
          <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} justifyContent="center">
            <Button
              href="mailto:hello@bldrs.ai"
              variant="contained"
              size="large"
              sx={{
                bgcolor: 'lime',
                color: '#000',
                fontWeight: 700,
                px: 4,
                py: 1.5,
                fontSize: '1.1rem',
                textTransform: 'none',
                '&:hover': {bgcolor: '#a0ff00'},
              }}
            >
              Contact Us
            </Button>
            <Button
              component={RouterLink}
              to="/services"
              variant="outlined"
              size="large"
              sx={{
                borderColor: 'rgba(255,255,255,0.3)',
                color: 'inherit',
                fontWeight: 600,
                px: 4,
                py: 1.5,
                fontSize: '1.1rem',
                textTransform: 'none',
                '&:hover': {borderColor: '#00F0FF', color: '#00F0FF'},
              }}
            >
              Our Services
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* Our Solution - 3 Cards */}
      <Box sx={{py: {xs: 8, md: 10}}}>
        <Container maxWidth="lg">
          <Box sx={{textAlign: 'center', mb: 6}}>
            <Typography variant="overline" sx={{color: 'lime', fontWeight: 700, letterSpacing: 2}}>
              Our Solution
            </Typography>
          </Box>
          <Grid container spacing={3}>
            {SOLUTION_CARDS.map((card, i) => (
              <Grid item xs={12} md={4} key={i}>
                <Card sx={{
                  height: '100%',
                  bgcolor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  transition: 'border-color 0.2s',
                  '&:hover': {borderColor: 'rgba(0,240,255,0.3)'},
                }}>
                  <CardContent sx={{p: 3}}>
                    <Box sx={{mb: 2}}>{card.icon}</Box>
                    <Typography variant="h6" sx={{fontWeight: 600, mb: 1}}>
                      {card.title}
                    </Typography>
                    <Typography variant="body2" sx={{opacity: 0.7, lineHeight: 1.7}}>
                      {card.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Key Features: Bldrs Share + AI Foundations */}
      <Box sx={{
        py: {xs: 8, md: 10},
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Container maxWidth="lg">
          <Grid container spacing={6}>
            <Grid item xs={12} md={6}>
              <Typography variant="overline" sx={{color: 'lime', fontWeight: 700, letterSpacing: 2}}>
                Bldrs Share
              </Typography>
              <Typography variant="h4" sx={{fontWeight: 700, mt: 1, mb: 3}}>
                Key Features
              </Typography>
              <Stack spacing={1.5}>
                {SHARE_FEATURES.map((feature, i) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{width: 6, height: 6, borderRadius: '50%', bgcolor: 'lime', flexShrink: 0}}/>
                    <Typography variant="body1" sx={{opacity: 0.85}}>
                      {feature}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="overline" sx={{color: '#00F0FF', fontWeight: 700, letterSpacing: 2}}>
                AI Foundations
              </Typography>
              <Typography variant="h4" sx={{fontWeight: 700, mt: 1, mb: 3}}>
                Intelligent Tools
              </Typography>
              <Stack spacing={1.5}>
                {AI_FEATURES.map((feature, i) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{width: 6, height: 6, borderRadius: '50%', bgcolor: '#00F0FF', flexShrink: 0}}/>
                    <Typography variant="body1" sx={{opacity: 0.85}}>
                      {feature}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Industry-Leading Performance */}
      <Box sx={{py: {xs: 8, md: 10}}}>
        <Container maxWidth="md" sx={{textAlign: 'center'}}>
          <SpeedIcon sx={{fontSize: 48, color: 'lime', mb: 2}}/>
          <Typography variant="h3" sx={{fontWeight: 700, mb: 1}}>
            Industry-Leading Performance
          </Typography>
          <Typography variant="h6" sx={{opacity: 0.6, mb: 5, fontWeight: 400}}>
            Fast is our Favorite Feature
          </Typography>
          <Grid container spacing={4} justifyContent="center" sx={{mb: 3}}>
            {PERFORMANCE_STATS.map((stat, i) => (
              <Grid item xs={12} sm={6} key={i}>
                <Card sx={{
                  bgcolor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  py: 3,
                }}>
                  <CardContent>
                    <Typography
                      variant="h2"
                      sx={{
                        fontWeight: 800,
                        color: i === 0 ? 'lime' : '#00F0FF',
                        fontSize: '3rem',
                        mb: 1,
                      }}
                    >
                      {stat.value}
                    </Typography>
                    <Typography variant="h6" sx={{fontWeight: 600, mb: 0.5}}>
                      {stat.label}
                    </Typography>
                    <Typography variant="body2" sx={{opacity: 0.5}}>
                      {stat.detail}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Typography variant="body2" sx={{opacity: 0.5, fontStyle: 'italic'}}>
            Compared to competitors taking 173-990 seconds for similar files
          </Typography>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box sx={{
        py: {xs: 8, md: 10},
        textAlign: 'center',
        background: 'linear-gradient(180deg, transparent 0%, rgba(0,255,0,0.05) 100%)',
      }}>
        <Container maxWidth="sm">
          <Typography variant="h3" sx={{fontWeight: 700, mb: 2}}>
            Ready to Transform Your Workflow?
          </Typography>
          <Typography variant="body1" sx={{opacity: 0.8, mb: 4, lineHeight: 1.8}}>
            Let&apos;s discuss how Bldrs.ai can accelerate your Digital Twin initiatives
            and unlock new capabilities for your team.
          </Typography>
          <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} justifyContent="center">
            <Button
              href="mailto:hello@bldrs.ai"
              variant="contained"
              size="large"
              sx={{
                bgcolor: 'lime',
                color: '#000',
                fontWeight: 700,
                px: 4,
                py: 1.5,
                textTransform: 'none',
                '&:hover': {bgcolor: '#a0ff00'},
              }}
            >
              Contact Us
            </Button>
            <Button
              component={RouterLink}
              to="/services"
              variant="outlined"
              size="large"
              sx={{
                borderColor: 'rgba(255,255,255,0.3)',
                color: 'inherit',
                fontWeight: 600,
                px: 4,
                py: 1.5,
                textTransform: 'none',
                '&:hover': {borderColor: 'lime', color: 'lime'},
              }}
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
          <Typography variant="h5" sx={{fontWeight: 600, mb: 2}}>
            Join the Revolution
          </Typography>
          <Typography variant="body1" sx={{opacity: 0.7, mb: 3, maxWidth: 600, mx: 'auto'}}>
            We&apos;re building the future of Digital Twin collaboration with Industry 4.0 technology,
            powering the next generation of engineering and smart manufacturing.
          </Typography>
          <Stack direction="row" spacing={3} justifyContent="center">
            <Button
              href="https://github.com/bldrs-ai"
              target="_blank"
              rel="noopener"
              startIcon={<GitHubIcon/>}
              sx={{color: 'inherit', textTransform: 'none', '&:hover': {color: 'lime'}}}
            >
              GitHub
            </Button>
            <Button
              href="https://www.linkedin.com/company/bldrs-ai"
              target="_blank"
              rel="noopener"
              sx={{color: 'inherit', textTransform: 'none', '&:hover': {color: 'lime'}}}
            >
              LinkedIn
            </Button>
            <Button
              href="https://twitter.com/bldrs_ai"
              target="_blank"
              rel="noopener"
              sx={{color: 'inherit', textTransform: 'none', '&:hover': {color: 'lime'}}}
            >
              Twitter
            </Button>
          </Stack>
        </Container>
      </Box>
    </MarketingLayout>
  )
}
