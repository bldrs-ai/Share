import type {Metadata} from 'next'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RocketIcon from '@mui/icons-material/Rocket'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import PricingTiers from '@/components/PricingTiers'
import {OG_IMAGE, SITE_NAME, SITE_URL, SOCIAL, VIEWER_PATH} from '@/lib/site'
import {CYAN, CYAN_HOVER, LIME, LIME_HOVER} from '@/lib/theme'


const TITLE = 'Pricing'
const DESCRIPTION =
  'Start free with Bldrs.ai. Flexible pricing for individuals, teams, and ' +
  'enterprises. Get AI-powered CAD collaboration, unlimited IFC & STEP viewing, ' +
  'and GitHub integration.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Bldrs.ai pricing',
    'CAD pricing',
    'Digital Twin pricing',
    'IFC viewer pricing',
    'team collaboration pricing',
    'enterprise CAD',
  ],
  alternates: {canonical: '/pricing'},
  openGraph: {
    title: `${TITLE} — ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/pricing`,
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


const ENTERPRISE_FEATURES_COL1 = [
  'Cloud storage integration',
  'On-premise or cloud deployment options',
  'Advanced enterprise security',
  'SSO integration',
  'Configurable issue management and workflow',
  'Enterprise branding',
]

const ENTERPRISE_FEATURES_COL2 = [
  'Enterprise tools integration',
  'Custom apps',
  'DfM workflows integration',
  'Configurable landing model',
  'Advanced Bldrs Tools',
  'API access',
  'Enterprise support',
]

const FAQS = [
  {
    q: 'What are tokens?',
    a:
      "AI tokens are units that measure AI usage in Bldrs.ai. Token usage is mainly related to syncing your project's file system to the AI and processing model data. Larger projects and more complex models use more tokens per operation. We continuously optimize to reduce token consumption while maintaining performance.",
  },
  {
    q: 'How do Teams plans work?',
    a:
      'Teams provide a shared workspace for users to collaborate on Bldrs.ai projects. The subscription cost is per team member. Each paid team member receives a monthly token allotment based on the subscription tier. Tokens are not shared among team members, ensuring predictable costs and usage.',
  },
  {
    q: 'Do tokens roll over from month to month?',
    a:
      'Yes! Tokens from a paid subscription roll over for one additional month, making them valid for up to two months in total. An active paid subscription is required to access rolled-over tokens. This ensures you never lose unused tokens and can handle variable workloads efficiently.',
  },
  {
    q: 'Can I change my plan later?',
    a:
      'Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle. You can manage your subscription through your account settings or our billing portal.',
  },
  {
    q: 'Can I cancel my subscription?',
    a:
      "Yes, you can cancel your subscription at any time with no penalties. Your access will continue until the end of your current billing period. After cancellation, you'll automatically revert to the Free plan.",
  },
  {
    q: 'What file formats do you support?',
    a:
      'Bldrs.ai supports industry-standard formats including IFC, STEP, STL, OBJ, and GLTF. We provide the fastest browser-based rendering for IFC and STEP files, with load times significantly faster than competitors.',
  },
]


export default function PricingPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': `${SITE_NAME} Pricing`,
    'description': DESCRIPTION,
    'url': `${SITE_URL}/pricing`,
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
        {/* Header */}
        <Box sx={{py: {xs: 8, md: 12}, textAlign: 'center'}}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h1" sx={{fontWeight: 800, mb: 2}}>
              Start for free.{' '}
              <Box component="span" sx={{color: CYAN}}>Upgrade as you go.</Box>
            </Typography>
            <Typography variant="h6" sx={{opacity: 0.7, fontWeight: 400}}>
              Choose the plan that fits your needs
            </Typography>
          </Container>
        </Box>

        <PricingTiers/>

        {/* Enterprise */}
        <Container maxWidth="lg" sx={{pb: {xs: 8, md: 12}}}>
          <Card sx={{bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)'}}>
            <CardContent sx={{p: {xs: 3, md: 5}}}>
              <Box sx={{textAlign: 'center', mb: 4}}>
                <Typography variant="h4" sx={{fontWeight: 700, mb: 1}}>Share Enterprise</Typography>
                <Typography variant="body1" sx={{opacity: 0.7}}>
                  IFC and STEP sharing and collaboration with DfM workflows for the enterprise.
                </Typography>
              </Box>
              <Grid container spacing={4}>
                <Grid item xs={12} md={6}>
                  <Stack spacing={1.5}>
                    {ENTERPRISE_FEATURES_COL1.map((feature) => (
                      <Stack key={feature} direction="row" spacing={1} alignItems="center">
                        <CheckIcon sx={{fontSize: 18, color: CYAN, flexShrink: 0}}/>
                        <Typography variant="body2" sx={{opacity: 0.8}}>{feature}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Stack spacing={1.5}>
                    {ENTERPRISE_FEATURES_COL2.map((feature) => (
                      <Stack key={feature} direction="row" spacing={1} alignItems="center">
                        <CheckIcon sx={{fontSize: 18, color: CYAN, flexShrink: 0}}/>
                        <Typography variant="body2" sx={{opacity: 0.8}}>{feature}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Grid>
              </Grid>
              <Divider sx={{my: 4, borderColor: 'rgba(255,255,255,0.08)'}}/>
              <Box sx={{textAlign: 'center'}}>
                <Button
                  href={SOCIAL.sales}
                  variant="contained"
                  size="large"
                  sx={{bgcolor: CYAN, color: '#000', fontWeight: 700, px: 5, py: 1.5, '&:hover': {bgcolor: CYAN_HOVER}}}
                >
                  Ask for a Quote
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Container>

        {/* FAQ */}
        <Box sx={{py: {xs: 8, md: 10}, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
          <Container maxWidth="md">
            <Box sx={{textAlign: 'center', mb: 6}}>
              <Typography variant="overline" sx={{color: CYAN}}>FAQ</Typography>
              <Typography variant="h3" sx={{fontWeight: 700, mt: 1}}>Frequently Asked Questions</Typography>
            </Box>
            {FAQS.map((faq) => (
              <Accordion
                key={faq.q}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  mb: 1,
                  '&:before': {display: 'none'},
                  '&.Mui-expanded': {mb: 1},
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
                  <Typography variant="subtitle1" sx={{fontWeight: 600}}>{faq.q}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" sx={{opacity: 0.8, lineHeight: 1.7}}>{faq.a}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* CTA */}
        <Box sx={{py: {xs: 6, md: 8}, textAlign: 'center'}}>
          <Container maxWidth="sm">
            <Typography variant="h4" sx={{fontWeight: 700, mb: 2}}>Ready to get started?</Typography>
            <Typography variant="body1" sx={{opacity: 0.7, mb: 4}}>
              Join thousands of professionals using Bldrs.ai to revolutionize their workflow
            </Typography>
            <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} justifyContent="center">
              <Button
                href={VIEWER_PATH}
                variant="contained"
                size="large"
                startIcon={<RocketIcon/>}
                sx={{bgcolor: LIME, color: '#000', fontWeight: 700, px: 4, py: 1.5, '&:hover': {bgcolor: LIME_HOVER}}}
              >
                Start Free
              </Button>
              <Button
                href={SOCIAL.sales}
                variant="outlined"
                size="large"
                sx={{borderColor: 'rgba(255,255,255,0.3)', color: 'inherit', fontWeight: 600, px: 4, py: 1.5, '&:hover': {borderColor: CYAN, color: CYAN}}}
              >
                Contact Sales
              </Button>
            </Stack>
          </Container>
        </Box>
      </Box>

      <SiteFooter/>
    </Box>
  )
}
