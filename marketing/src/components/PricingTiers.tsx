'use client'
import {useState} from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import RocketIcon from '@mui/icons-material/Rocket'
import StarIcon from '@mui/icons-material/Star'
import {SOCIAL, VIEWER_PATH} from '@/lib/site'
import {LIME, LIME_HOVER} from '@/lib/theme'


interface Section {
  heading: string | null
  features: string[]
}

interface Plan {
  name: string
  monthlyPrice: number
  yearlyPrice: number
  perMember?: boolean
  description: string
  sections: Section[]
  cta: string
  ctaLink: string
  ctaVariant: 'contained' | 'outlined'
  highlight: boolean
  badge?: string
}

const PLANS: Plan[] = [
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
          'Bldrs public GitHub repositories',
          'Basic Bldrs Tools',
          'Drag and drop',
          'No data transfer',
          '2 model loads per month',
        ],
      },
      {
        heading: 'With Login:',
        features: [
          '4 model loads per month',
        ],
      },
    ],
    cta: 'Get Started',
    ctaLink: VIEWER_PATH,
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
        ],
      },
    ],
    cta: 'Start Pro',
    ctaLink: VIEWER_PATH,
    ctaVariant: 'contained',
    highlight: true,
    badge: 'Popular',
  },
]


/**
 * Pricing cards + monthly/yearly toggle. Client component because the toggle
 * needs React state — the surrounding page (metadata, JSON-LD, layout chrome)
 * stays in a server component.
 */
export default function PricingTiers() {
  const [isYearly, setIsYearly] = useState(false)

  return (
    <Box>
      {/* Toggle */}
      <Container maxWidth="md" sx={{textAlign: 'center', mb: 6}}>
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
          <Typography variant="body1" sx={{opacity: isYearly ? 0.5 : 1, fontWeight: isYearly ? 400 : 700}}>
            Monthly
          </Typography>
          <Switch
            checked={isYearly}
            onChange={() => setIsYearly(!isYearly)}
            inputProps={{'aria-label': 'Toggle yearly pricing'}}
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': {color: LIME},
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {bgcolor: LIME},
            }}
          />
          <Typography variant="body1" sx={{opacity: isYearly ? 1 : 0.5, fontWeight: isYearly ? 700 : 400}}>
            Yearly
          </Typography>
          {isYearly && (
            <Chip label="Save 10%" size="small" sx={{bgcolor: LIME, color: '#000', fontWeight: 700, ml: 1}}/>
          )}
        </Stack>
      </Container>

      {/* Plan cards */}
      <Container maxWidth="lg" sx={{pb: 6}}>
        <Grid container spacing={3} alignItems="stretch">
          {PLANS.map((plan) => (
            <Grid item xs={12} md={4} key={plan.name}>
              <Card sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: plan.highlight ? 'rgba(0,255,0,0.05)' : 'rgba(255,255,255,0.03)',
                border: plan.highlight ? `2px solid ${LIME}` : '1px solid rgba(255,255,255,0.08)',
                position: 'relative',
                overflow: 'visible',
                transition: 'border-color 0.2s',
                '&:hover': {borderColor: plan.highlight ? LIME : 'rgba(0,240,255,0.3)'},
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
                      bgcolor: LIME,
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
                        {section.features.map((feature) => (
                          <Stack key={feature} direction="row" spacing={1} alignItems="flex-start">
                            <CheckIcon sx={{fontSize: 18, color: LIME, mt: 0.3, flexShrink: 0}}/>
                            <Typography variant="body2" sx={{opacity: 0.8}}>{feature}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  ))}

                  <Box sx={{mt: 'auto', pt: 2}}>
                    <Button
                      href={plan.ctaLink}
                      variant={plan.ctaVariant}
                      fullWidth
                      startIcon={plan.highlight ? <RocketIcon/> : undefined}
                      sx={plan.ctaVariant === 'contained' ? {
                        bgcolor: LIME,
                        color: '#000',
                        fontWeight: 700,
                        '&:hover': {bgcolor: LIME_HOVER},
                      } : {
                        borderColor: 'rgba(255,255,255,0.3)',
                        color: 'inherit',
                        fontWeight: 600,
                        '&:hover': {borderColor: LIME, color: LIME},
                      }}
                    >
                      {plan.cta}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  )
}
