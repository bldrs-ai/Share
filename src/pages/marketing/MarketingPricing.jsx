import React, {ReactElement, useState} from 'react'
import {Link as RouterLink} from 'react-router-dom'
import {Helmet} from 'react-helmet-async'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import {
  Check as CheckIcon,
  ExpandMore as ExpandMoreIcon,
  Rocket as RocketIcon,
  Star as StarIcon,
} from '@mui/icons-material'
import MarketingLayout from './MarketingLayout'


const PLANS = [
  {
    name: 'Bldrs Share',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'Fastest, browser-first IFC and STEP viewing',
    sections: [
      {
        heading: 'No Login Required:',
        features: [
          'Fastest free IFC and STEP viewing',
          'Drag and drop',
          'No data transfer',
          '10 model loads per month',
        ],
      },
      {
        heading: 'With Login:',
        features: [
          '25 model loads per month',
          'Bldrs public GitHub repositories',
          'Basic Bldrs Tools',
          'Bldrs Assistant',
          '1M tokens',
        ],
      },
    ],
    cta: 'Get Started',
    ctaLink: '/share',
    ctaVariant: 'outlined',
    highlight: false,
  },
  {
    name: 'Share Pro',
    monthlyPrice: 25,
    yearlyPrice: 270,
    description: 'IFC and STEP sharing and collaboration for individual professionals',
    sections: [
      {
        heading: null,
        features: [
          'All Share capabilities plus:',
          'Private GitHub and Google Drive repositories',
          'Private collaboration',
          'Configurable landing model',
          'Advanced Bldrs Tools',
          'Bldrs Assistant',
          'Bldrs Apps Creator',
          '10M tokens',
        ],
      },
    ],
    cta: 'Start Pro',
    ctaLink: '/share',
    ctaVariant: 'contained',
    highlight: true,
    badge: 'Popular',
  },
  {
    name: 'Share Teams',
    monthlyPrice: 30,
    yearlyPrice: 324,
    perMember: true,
    description: 'IFC and STEP sharing and collaboration for individual professionals and teams',
    sections: [
      {
        heading: null,
        features: [
          'All Share capabilities plus:',
          'Centralized billing',
          'Team-level access management',
          'Team Apps Library with admin controls',
          'Shared token pools',
          'Unified billing',
          'Configurable landing model',
          'Advanced Bldrs Tools',
          'Apps library extensions',
          '50M tokens',
        ],
      },
    ],
    cta: 'Contact Bldrs',
    ctaLink: 'mailto:hello@bldrs.ai',
    ctaVariant: 'outlined',
    highlight: false,
  },
]

const ENTERPRISE_FEATURES_COL1 = [
  'Cloud storage integration',
  'On premise or cloud deployment options',
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
    a: 'AI tokens are units that measure AI usage in Bldrs.ai. Token usage is mainly related to syncing your project\'s file system to the AI and processing model data. Larger projects and more complex models use more tokens per operation. We continuously optimize to reduce token consumption while maintaining performance.',
  },
  {
    q: 'How do Teams plans work?',
    a: 'Teams provide a shared workspace for users to collaborate on Bldrs.ai projects. The subscription cost is per team member. Each paid team member receives a monthly token allotment based on the subscription tier. Tokens are not shared among team members, ensuring predictable costs and usage.',
  },
  {
    q: 'Do tokens rollover from month to month?',
    a: 'Yes! Tokens from a paid subscription roll over for one additional month, making them valid for up to two months in total. An active paid subscription is required to access rolled over tokens. This ensures you never lose unused tokens and can handle variable workloads efficiently.',
  },
  {
    q: 'Can I change my plan later?',
    a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle. You can manage your subscription through your account settings or our billing portal.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes, you can cancel your subscription at any time with no penalties. Your access will continue until the end of your current billing period. After cancellation, you\'ll automatically revert to the Free plan.',
  },
  {
    q: 'What file formats do you support?',
    a: 'Bldrs.ai supports industry-standard formats including IFC, STEP, STL, OBJ, and GLTF. We provide the fastest browser-based rendering for IFC and STEP files, with load times significantly faster than competitors.',
  },
]


/**
 * Marketing Pricing page with plan tiers and FAQ.
 *
 * @return {ReactElement}
 */
export default function MarketingPricing() {
  const [isYearly, setIsYearly] = useState(false)

  return (
    <MarketingLayout>
      <Helmet>
        <title>Pricing - Bldrs.ai Digital Twin Collaboration Plans</title>
        <meta name="description" content="Start free with Bldrs.ai. Flexible pricing for individuals, teams, and enterprises. Get AI-powered CAD collaboration, unlimited IFC & STEP viewing, and GitHub integration."/>
        <meta name="keywords" content="Bldrs.ai pricing, CAD pricing, Digital Twin pricing, IFC viewer pricing, team collaboration pricing, enterprise CAD"/>
        <meta property="og:title" content="Pricing - Bldrs.ai Digital Twin Collaboration Plans"/>
        <meta property="og:description" content="Start free with Bldrs.ai. Flexible pricing for individuals, teams, and enterprises."/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://bldrs.ai/pricing"/>
        <meta name="twitter:card" content="summary"/>
        <meta name="twitter:title" content="Pricing - Bldrs.ai Digital Twin Collaboration Plans"/>
        <link rel="canonical" href="https://bldrs.ai/pricing"/>
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          'name': 'Bldrs Pricing',
          'description': 'Pricing plans for Bldrs.ai Digital Twin collaboration platform',
          'url': 'https://bldrs.ai/pricing',
        })}</script>
      </Helmet>

      {/* Header */}
      <Box sx={{py: {xs: 8, md: 12}, textAlign: 'center'}}>
        <Container maxWidth="md">
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              mb: 2,
              fontSize: {xs: '2.2rem', md: '3.2rem'},
              letterSpacing: '-0.02em',
            }}
          >
            Start for free.{' '}
            <Box component="span" sx={{color: '#00F0FF'}}>Upgrade as you go.</Box>
          </Typography>
          <Typography variant="h6" sx={{opacity: 0.7, fontWeight: 400, mb: 4}}>
            Choose the plan that fits your needs
          </Typography>

          {/* Monthly/Yearly Toggle */}
          <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
            <Typography variant="body1" sx={{opacity: isYearly ? 0.5 : 1, fontWeight: isYearly ? 400 : 700}}>
              Monthly
            </Typography>
            <Switch
              checked={isYearly}
              onChange={() => setIsYearly(!isYearly)}
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': {color: 'lime'},
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {bgcolor: 'lime'},
              }}
            />
            <Typography variant="body1" sx={{opacity: isYearly ? 1 : 0.5, fontWeight: isYearly ? 700 : 400}}>
              Yearly
            </Typography>
            {isYearly && (
              <Chip label="Save 10%" size="small" sx={{bgcolor: 'lime', color: '#000', fontWeight: 700}}/>
            )}
          </Stack>
        </Container>
      </Box>

      {/* Pricing Cards */}
      <Container maxWidth="lg" sx={{pb: 6}}>
        <Grid container spacing={3} alignItems="stretch">
          {PLANS.map((plan, i) => {
            const isMailto = plan.ctaLink.startsWith('mailto:')
            return (
              <Grid item xs={12} md={4} key={i}>
                <Card sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  bgcolor: plan.highlight ? 'rgba(0,255,0,0.05)' : 'rgba(255,255,255,0.03)',
                  border: plan.highlight ? '2px solid lime' : '1px solid rgba(255,255,255,0.08)',
                  position: 'relative',
                  transition: 'border-color 0.2s',
                  '&:hover': {borderColor: plan.highlight ? 'lime' : 'rgba(0,240,255,0.3)'},
                }}>
                  {plan.badge && (
                    <Chip
                      icon={<StarIcon sx={{color: '#000 !important'}}/>}
                      label={plan.badge}
                      sx={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        bgcolor: 'lime',
                        color: '#000',
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <CardContent sx={{p: 3, flex: 1, display: 'flex', flexDirection: 'column'}}>
                    <Typography variant="h5" sx={{fontWeight: 700, mb: 0.5}}>
                      {plan.name}
                    </Typography>
                    <Typography variant="body2" sx={{opacity: 0.6, mb: 2}}>
                      {plan.description}
                    </Typography>

                    <Box sx={{mb: 3}}>
                      <Stack direction="row" alignItems="baseline" spacing={0.5}>
                        <Typography variant="h3" sx={{fontWeight: 800}}>
                          ${isYearly ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice}
                        </Typography>
                        <Typography variant="body2" sx={{opacity: 0.5}}>
                          /{plan.perMember ? 'member/month' : 'month'}
                        </Typography>
                      </Stack>
                      {isYearly && plan.yearlyPrice > 0 && (
                        <Typography variant="caption" sx={{opacity: 0.5}}>
                          ${plan.yearlyPrice}{plan.perMember ? '/member' : ''}/year billed annually
                        </Typography>
                      )}
                    </Box>

                    {plan.sections.map((section, si) => (
                      <Box key={si} sx={{mb: 2}}>
                        {section.heading && (
                          <Typography variant="subtitle2" sx={{fontWeight: 700, mb: 1, opacity: 0.9}}>
                            {section.heading}
                          </Typography>
                        )}
                        <Stack spacing={1}>
                          {section.features.map((feature, fi) => (
                            <Stack key={fi} direction="row" spacing={1} alignItems="flex-start">
                              <CheckIcon sx={{fontSize: 18, color: 'lime', mt: 0.3, flexShrink: 0}}/>
                              <Typography variant="body2" sx={{opacity: 0.8}}>
                                {feature}
                              </Typography>
                            </Stack>
                          ))}
                        </Stack>
                      </Box>
                    ))}

                    <Box sx={{mt: 'auto', pt: 2}}>
                      <Button
                        component={isMailto ? 'a' : RouterLink}
                        href={isMailto ? plan.ctaLink : undefined}
                        to={isMailto ? undefined : plan.ctaLink}
                        variant={plan.ctaVariant}
                        fullWidth
                        startIcon={plan.highlight ? <RocketIcon/> : undefined}
                        sx={{
                          ...(plan.ctaVariant === 'contained' ? {
                            bgcolor: 'lime',
                            color: '#000',
                            fontWeight: 700,
                            textTransform: 'none',
                            '&:hover': {bgcolor: '#a0ff00'},
                          } : {
                            borderColor: 'rgba(255,255,255,0.3)',
                            color: 'inherit',
                            fontWeight: 600,
                            textTransform: 'none',
                            '&:hover': {borderColor: 'lime', color: 'lime'},
                          }),
                        }}
                      >
                        {plan.cta}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      </Container>

      {/* Enterprise Card */}
      <Container maxWidth="lg" sx={{pb: {xs: 8, md: 12}}}>
        <Card sx={{
          bgcolor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <CardContent sx={{p: {xs: 3, md: 5}}}>
            <Box sx={{textAlign: 'center', mb: 4}}>
              <Typography variant="h4" sx={{fontWeight: 700, mb: 1}}>
                Share Enterprise
              </Typography>
              <Typography variant="body1" sx={{opacity: 0.7}}>
                IFC and STEP sharing and collaboration with DfM workflows for the enterprise.
              </Typography>
            </Box>
            <Grid container spacing={4}>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.5}>
                  {ENTERPRISE_FEATURES_COL1.map((feature, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                      <CheckIcon sx={{fontSize: 18, color: '#00F0FF', flexShrink: 0}}/>
                      <Typography variant="body2" sx={{opacity: 0.8}}>{feature}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.5}>
                  {ENTERPRISE_FEATURES_COL2.map((feature, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                      <CheckIcon sx={{fontSize: 18, color: '#00F0FF', flexShrink: 0}}/>
                      <Typography variant="body2" sx={{opacity: 0.8}}>{feature}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Grid>
            </Grid>
            <Divider sx={{my: 4, borderColor: 'rgba(255,255,255,0.08)'}}/>
            <Box sx={{textAlign: 'center'}}>
              <Button
                href="mailto:hello@bldrs.ai"
                variant="contained"
                size="large"
                sx={{
                  bgcolor: '#00F0FF',
                  color: '#000',
                  fontWeight: 700,
                  px: 5,
                  py: 1.5,
                  textTransform: 'none',
                  '&:hover': {bgcolor: '#00d4e0'},
                }}
              >
                Ask for a Quote
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>

      {/* FAQ Section */}
      <Box sx={{
        py: {xs: 8, md: 10},
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Container maxWidth="md">
          <Box sx={{textAlign: 'center', mb: 6}}>
            <Typography variant="overline" sx={{color: '#00F0FF', fontWeight: 700, letterSpacing: 2}}>
              FAQ
            </Typography>
            <Typography variant="h3" sx={{fontWeight: 700, mt: 1}}>
              Frequently Asked Questions
            </Typography>
          </Box>
          {FAQS.map((faq, i) => (
            <Accordion
              key={i}
              sx={{
                bgcolor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                mb: 1,
                '&:before': {display: 'none'},
                '&.Mui-expanded': {mb: 1},
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
                <Typography variant="subtitle1" sx={{fontWeight: 600}}>
                  {faq.q}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" sx={{opacity: 0.8, lineHeight: 1.7}}>
                  {faq.a}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Container>
      </Box>

      {/* Bottom CTA */}
      <Box sx={{py: {xs: 6, md: 8}, textAlign: 'center'}}>
        <Container maxWidth="sm">
          <Typography variant="h4" sx={{fontWeight: 700, mb: 2}}>
            Ready to get started?
          </Typography>
          <Typography variant="body1" sx={{opacity: 0.7, mb: 4}}>
            Join thousands of professionals using Bldrs.ai to revolutionize their workflow
          </Typography>
          <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} justifyContent="center">
            <Button
              component={RouterLink}
              to="/share"
              variant="contained"
              size="large"
              startIcon={<RocketIcon/>}
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
              Start Free
            </Button>
            <Button
              href="mailto:hello@bldrs.ai"
              variant="outlined"
              size="large"
              sx={{
                borderColor: 'rgba(255,255,255,0.3)',
                color: 'inherit',
                fontWeight: 600,
                px: 4,
                py: 1.5,
                textTransform: 'none',
                '&:hover': {borderColor: '#00F0FF', color: '#00F0FF'},
              }}
            >
              Contact Sales
            </Button>
          </Stack>
        </Container>
      </Box>
    </MarketingLayout>
  )
}
