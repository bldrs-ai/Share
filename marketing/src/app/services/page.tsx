import type {Metadata} from 'next'
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
import BuildIcon from '@mui/icons-material/Build'
import CheckIcon from '@mui/icons-material/Check'
import CodeIcon from '@mui/icons-material/Code'
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects'
import EngineeringIcon from '@mui/icons-material/Engineering'
import FactoryIcon from '@mui/icons-material/Factory'
import FlightIcon from '@mui/icons-material/FlightTakeoff'
import GroupsIcon from '@mui/icons-material/Groups'
import RocketIcon from '@mui/icons-material/Rocket'
import SunIcon from '@mui/icons-material/WbSunny'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import {OG_IMAGE, SITE_NAME, SITE_URL, SOCIAL, VIEWER_PATH} from '@/lib/site'
import {CYAN, LIME, LIME_HOVER} from '@/lib/theme'


const TITLE = 'Services'
const DESCRIPTION =
  'Expert consulting and integration services for Digital Twins and AI-powered CAD. ' +
  'Custom solutions for manufacturing, AEC, energy, and aerospace. Transform your ' +
  'engineering workflows.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Digital Twin consulting',
    'CAD integration',
    'BIM services',
    'IFC consulting',
    'STEP integration',
    'AI CAD services',
    'manufacturing consulting',
    'AEC consulting',
    'Industry 4.0',
    'Design for Manufacturing',
    'DFM',
  ],
  alternates: {canonical: '/services'},
  openGraph: {
    title: `${TITLE} — ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/services`,
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


const CORE_SERVICES = [
  {
    Icon: CodeIcon,
    color: LIME,
    title: 'Digital Twin Integration',
    description: 'Seamlessly integrate Bldrs.ai into your existing workflows and toolchains',
    features: [
      'Custom API integrations with your CAD and PLM systems',
      'IFC and STEP data pipeline automation',
      'GitHub workflow setup and optimization',
      'CI/CD integration for automated model validation',
      'Cloud infrastructure setup and optimization',
    ],
  },
  {
    Icon: BuildIcon,
    color: CYAN,
    title: 'AI-Powered Customization',
    description: 'Extend Bldrs.ai with custom AI assistants and specialized tools for your industry',
    features: [
      'Custom AI assistant training for your domain',
      'Specialized validation rules and compliance checking',
      'Industry-specific model analysis tools',
      'Automated reporting and documentation generation',
      'Custom plugins and extensions development',
    ],
  },
  {
    Icon: EmojiObjectsIcon,
    color: LIME,
    title: 'Digital Transformation Consulting',
    description: 'Strategic guidance for Industry 4.0, AI integration, and modern manufacturing',
    features: [
      'Digital Twin strategy and implementation roadmaps',
      'AI strategy and intelligent automation solutions',
      'Industry 4.0 transformation planning',
      'Design for Manufacturing (DFM) optimization',
      'Open standards adoption and workflow modernization',
    ],
  },
  {
    Icon: GroupsIcon,
    color: CYAN,
    title: 'Enterprise Support & Training',
    description: 'Dedicated support to ensure your team maximizes Bldrs.ai capabilities',
    features: [
      'Hands-on training sessions for your teams',
      '24/7 dedicated technical support',
      'Regular office hours with Bldrs.ai experts',
      'Custom documentation and best practices',
      'Ongoing optimization and performance tuning',
    ],
  },
]

const INDUSTRIES = [
  {
    Icon: FactoryIcon,
    color: LIME,
    title: 'New Manufacturing',
    description: 'Edge manufacturing, 3D printing, and advanced production labs',
    applications: [
      'Digital Twin-based production planning',
      'Real-time model collaboration across facilities',
      'AI-powered design optimization',
      'Supply chain visualization',
    ],
  },
  {
    Icon: SunIcon,
    color: CYAN,
    title: 'New Energy',
    description: 'Solar, battery systems, and e-mobility infrastructure',
    applications: [
      'Facility and infrastructure modeling',
      'Performance simulation and analysis',
      'Compliance validation and reporting',
      'Multi-site project coordination',
    ],
  },
  {
    Icon: EngineeringIcon,
    color: LIME,
    title: 'AEC & Construction',
    description: 'Commercial buildings, pre-fab, and datacenter infrastructure',
    applications: [
      'BIM coordination and clash detection',
      'Automated code compliance checking',
      'As-built documentation and verification',
      'Stakeholder collaboration and review',
    ],
  },
  {
    Icon: FlightIcon,
    color: CYAN,
    title: 'Aerospace & Defense',
    description: 'Complex assemblies requiring precision and traceability',
    applications: [
      'STEP file management and versioning',
      'Configuration management',
      'Supplier collaboration platforms',
      'Design review and approval workflows',
    ],
  },
]

const CASE_STUDIES = [
  {
    title: 'Manufacturing Scale-Up',
    client: 'Leading 3D Printing Lab',
    challenge: 'Needed to coordinate complex CAD models across multiple facilities and partners',
    solution: 'Implemented Bldrs.ai with custom GitHub workflows and automated validation',
    results: [
      '70% reduction in model coordination time',
      'Real-time collaboration across 5 global sites',
      'Eliminated file versioning conflicts',
    ],
  },
  {
    title: 'Solar Farm Development',
    client: 'Renewable Energy Developer',
    challenge: 'Managing design iterations across 20+ simultaneous projects',
    solution: 'Custom AI assistant for automated compliance checking and design optimization',
    results: [
      '50% faster project delivery',
      'Automated regulatory compliance validation',
      'Reduced design errors by 85%',
    ],
  },
]

const APPROACH_STEPS = [
  {num: '01', title: 'Discover', description: 'Understand your workflows, challenges, and goals'},
  {num: '02', title: 'Design', description: 'Create a tailored solution architecture'},
  {num: '03', title: 'Deliver', description: 'Implement, test, and deploy your solution'},
  {num: '04', title: 'Support', description: 'Ongoing optimization and support'},
]

const WHY_US_STATS = [
  {value: '15+', color: LIME, label: 'Years Combined CAD Experience'},
  {value: '150K+', color: CYAN, label: 'Platform Users Worldwide'},
  {value: '5x', color: LIME, label: 'Faster Than Competitors'},
]


export default function ServicesPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': `${SITE_NAME} Services`,
    'description': DESCRIPTION,
    'url': `${SITE_URL}/services`,
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
          py: {xs: 8, md: 12},
          textAlign: 'center',
          background: 'linear-gradient(180deg, rgba(0,240,255,0.05) 0%, transparent 60%)',
        }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h1" sx={{fontWeight: 800, mb: 2}}>
              Bldrs <Box component="span" sx={{color: CYAN}}>Services</Box>
            </Typography>
            <Typography variant="h6" sx={{opacity: 0.8, fontWeight: 400, mb: 3}}>
              Expert consulting and integration services to accelerate your Digital Twin journey
            </Typography>
            <Typography variant="body1" sx={{opacity: 0.7, maxWidth: 640, mx: 'auto', lineHeight: 1.8}}>
              Our team of CAD, AI, and Digital Twin experts helps you unlock the full potential
              of Bldrs.ai. From integration to custom development, we ensure your success every
              step of the way.
            </Typography>
          </Container>
        </Box>

        {/* Core Services */}
        <Box sx={{py: {xs: 4, md: 6}}}>
          <Container maxWidth="lg">
            <Grid container spacing={4}>
              {CORE_SERVICES.map(({Icon, color, title, description, features}) => (
                <Grid item xs={12} md={6} key={title}>
                  <Card sx={{
                    height: '100%',
                    bgcolor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    transition: 'border-color 0.2s',
                    '&:hover': {borderColor: 'rgba(0,240,255,0.3)'},
                  }}>
                    <CardContent sx={{p: 3}}>
                      <Box sx={{mb: 2}}><Icon sx={{fontSize: 40, color}}/></Box>
                      <Typography variant="h5" sx={{fontWeight: 700, mb: 0.5}}>{title}</Typography>
                      <Typography variant="body2" sx={{opacity: 0.6, mb: 2}}>{description}</Typography>
                      <Stack spacing={1}>
                        {features.map((feature) => (
                          <Stack key={feature} direction="row" spacing={1} alignItems="flex-start">
                            <CheckIcon sx={{fontSize: 16, color: LIME, mt: 0.4, flexShrink: 0}}/>
                            <Typography variant="body2" sx={{opacity: 0.8}}>{feature}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Industry Expertise */}
        <Box sx={{py: {xs: 8, md: 10}, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
          <Container maxWidth="lg">
            <Box sx={{textAlign: 'center', mb: 6}}>
              <Typography variant="overline" sx={{color: CYAN}}>Industry Expertise</Typography>
              <Typography variant="h3" sx={{fontWeight: 700, mt: 1}}>Built for Your Industry</Typography>
            </Box>
            <Grid container spacing={3}>
              {INDUSTRIES.map(({Icon, color, title, description, applications}, i) => (
                <Grid item xs={12} md={6} key={title}>
                  <Card sx={{height: '100%', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)'}}>
                    <CardContent sx={{p: 3}}>
                      <Stack direction="row" spacing={2} alignItems="center" sx={{mb: 2}}>
                        <Icon sx={{fontSize: 36, color}}/>
                        <Box>
                          <Typography variant="h6" sx={{fontWeight: 600}}>{title}</Typography>
                          <Typography variant="body2" sx={{opacity: 0.6}}>{description}</Typography>
                        </Box>
                      </Stack>
                      <Typography variant="caption" sx={{opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1}}>
                        Key Applications
                      </Typography>
                      <Stack spacing={0.75}>
                        {applications.map((app) => (
                          <Stack key={app} direction="row" spacing={1} alignItems="center">
                            <Box sx={{width: 5, height: 5, borderRadius: '50%', bgcolor: i % 2 === 0 ? LIME : CYAN, flexShrink: 0}}/>
                            <Typography variant="body2" sx={{opacity: 0.8}}>{app}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Case Studies */}
        <Box sx={{
          py: {xs: 8, md: 10},
          background: 'linear-gradient(180deg, rgba(0,240,255,0.03) 0%, transparent 100%)',
        }}>
          <Container maxWidth="lg">
            <Box sx={{textAlign: 'center', mb: 6}}>
              <Typography variant="overline" sx={{color: LIME}}>Success Stories</Typography>
              <Typography variant="h3" sx={{fontWeight: 700, mt: 1}}>Real Results from Real Teams</Typography>
            </Box>
            <Grid container spacing={4}>
              {CASE_STUDIES.map((study) => (
                <Grid item xs={12} md={6} key={study.title}>
                  <Card sx={{height: '100%', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)'}}>
                    <CardContent sx={{p: 3}}>
                      <Typography variant="h5" sx={{fontWeight: 700, mb: 0.5}}>{study.title}</Typography>
                      <Typography variant="body2" sx={{opacity: 0.5, mb: 2}}>
                        Client: {study.client}
                      </Typography>

                      <Typography variant="caption" sx={{opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1}}>Challenge</Typography>
                      <Typography variant="body2" sx={{opacity: 0.8, mb: 1.5}}>{study.challenge}</Typography>

                      <Typography variant="caption" sx={{opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1}}>Solution</Typography>
                      <Typography variant="body2" sx={{opacity: 0.8, mb: 1.5}}>{study.solution}</Typography>

                      <Typography variant="caption" sx={{opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1}}>Results</Typography>
                      <Stack spacing={0.5} sx={{mt: 0.5}}>
                        {study.results.map((result) => (
                          <Stack key={result} direction="row" spacing={1} alignItems="center">
                            <CheckIcon sx={{fontSize: 16, color: LIME, flexShrink: 0}}/>
                            <Typography variant="body2" sx={{fontWeight: 600}}>{result}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Approach */}
        <Box sx={{py: {xs: 8, md: 10}, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
          <Container maxWidth="lg">
            <Box sx={{textAlign: 'center', mb: 6}}>
              <Typography variant="overline" sx={{color: LIME}}>Our Approach</Typography>
              <Typography variant="h3" sx={{fontWeight: 700, mt: 1}}>From Discovery to Delivery</Typography>
            </Box>
            <Grid container spacing={3}>
              {APPROACH_STEPS.map((step, i) => (
                <Grid item xs={12} sm={6} md={3} key={step.num}>
                  <Box sx={{textAlign: 'center'}}>
                    <Typography variant="h2" sx={{fontWeight: 800, color: i % 2 === 0 ? LIME : CYAN, opacity: 0.3, fontSize: '3.5rem', lineHeight: 1, mb: 1}}>
                      {step.num}
                    </Typography>
                    <Typography variant="h6" sx={{fontWeight: 700, mb: 0.5}}>{step.title}</Typography>
                    <Typography variant="body2" sx={{opacity: 0.7}}>{step.description}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Why Us */}
        <Box sx={{py: 6, borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
          <Container maxWidth="md">
            <Grid container spacing={4}>
              {WHY_US_STATS.map((stat) => (
                <Grid item xs={12} sm={4} key={stat.label}>
                  <Box sx={{textAlign: 'center'}}>
                    <Typography variant="h3" sx={{fontWeight: 800, color: stat.color, fontSize: {xs: '2rem', md: '2.5rem'}}}>
                      {stat.value}
                    </Typography>
                    <Typography variant="body2" sx={{opacity: 0.7, mt: 0.5}}>{stat.label}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
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
              Let&apos;s discuss how Bldrs Services can accelerate your Digital Twin initiatives
              and unlock new capabilities for your team.
            </Typography>
            <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} justifyContent="center">
              <Button
                href={SOCIAL.services}
                variant="contained"
                size="large"
                sx={{bgcolor: LIME, color: '#000', fontWeight: 700, px: 4, py: 1.5, '&:hover': {bgcolor: LIME_HOVER}}}
              >
                Schedule Consultation
              </Button>
              <Button
                href={VIEWER_PATH}
                variant="outlined"
                size="large"
                startIcon={<RocketIcon/>}
                sx={{borderColor: 'rgba(255,255,255,0.3)', color: 'inherit', fontWeight: 600, px: 4, py: 1.5, '&:hover': {borderColor: LIME, color: LIME}}}
              >
                Try Bldrs Free
              </Button>
            </Stack>
            <Typography variant="body2" sx={{opacity: 0.5, mt: 3}}>
              Or email us at services@bldrs.ai
            </Typography>
          </Container>
        </Box>
      </Box>

      <SiteFooter/>
    </Box>
  )
}
