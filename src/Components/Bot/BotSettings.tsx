import React, {ChangeEvent, ReactElement, useEffect, useState} from 'react'
import {
  Box, Button, FormControlLabel, InputBase, ListItemText, MenuItem, Switch, TextField, Typography,
} from '@mui/material'
import {DEFAULT_MODEL_LABEL} from '../../tools/assistModels'
import {DEFAULT_MODEL_CHOICE, loadAssistCatalogue} from './assistModelChoice'


/**
 * Settings panel for the bot:
 *  - which model Bldrs' hosted assistant answers with (#1934): the
 *    "Free models (experimental)" opt-in for everyone, and for Pro a menu of
 *    the relay's catalogue with each model's price. The choice is saved on
 *    the device (assistModelChoice.js); the relay re-checks it per request.
 *    Hidden while a key of the user's own is set: that key's transport keeps
 *    the default model, so a menu here would promise a choice it ignores.
 *  - the user's own OpenRouter key, which is optional (without one the
 *    assistant uses Bldrs' hosted models within the plan's credits, #1932)
 *    and which the panel keeps in this tab's memory only (assist/keyStore.ts).
 *    Saving it empty forgets it, back to hosted. Choosing a provider,
 *    remembering a key on the device and Test connection are #1930.
 *
 * Both are applied on OK.
 *
 * @param props
 * @return The settings panel
 */
export default function BotSettings({
  apiKey, onApiKeyChange, onClose, modelChoice = DEFAULT_MODEL_CHOICE, onModelChoiceChange, isPro = false,
  loadCatalogue = loadAssistCatalogue,
}: BotSettingsProps): ReactElement {
  const [localApiKey, setLocalApiKey] = useState<string>(apiKey)
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [freeModels, setFreeModels] = useState<boolean>(modelChoice.freeModels)
  const [model, setModel] = useState<string>(modelChoice.model ?? '')
  const hasKey = apiKey !== ''
  const showPicker = isPro && !hasKey
  const catalogue = useCatalogue(showPicker, loadCatalogue)

  useEffect(() => {
    setLocalApiKey(apiKey)
  }, [apiKey])

  const handleSave = () => {
    onApiKeyChange(localApiKey.trim())
    onModelChoiceChange?.({freeModels, model: model === '' ? null : model})
    onClose()
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '1.5em',
        justifyContent: 'space-between',
        overflowY: 'auto',
      }}
      data-testid='BotSettings'
    >
      <Box sx={{display: 'flex', flexDirection: 'column', gap: '1.5em'}}>
        <Box sx={{display: 'flex', flexDirection: 'column', gap: '0.75em'}} data-testid='BotSettings-Model'>
          <Typography variant='subtitle2' component='h3' sx={{fontWeight: 600}}>
            Model
          </Typography>
          {hasKey ? (
            <Typography variant='caption' sx={{color: 'text.secondary'}} data-testid='BotSettings-ModelByokNote'>
              With your own key, the assistant uses {DEFAULT_MODEL_LABEL} on your OpenRouter account. Choosing a
              model is for Bldrs&apos; hosted assistant; clear the key below to use it.
            </Typography>
          ) : (
            <>
              {showPicker ? (
                <ModelMenu
                  catalogue={catalogue}
                  value={model}
                  disabled={freeModels}
                  onChange={setModel}
                />
              ) : (
                <Typography variant='caption' sx={{color: 'text.secondary'}} data-testid='BotSettings-ProHint'>
                  The assistant uses {DEFAULT_MODEL_LABEL}. Pro adds a choice of models.
                </Typography>
              )}
              <FormControlLabel
                control={
                  <Switch
                    size='small'
                    checked={freeModels}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setFreeModels(event.target.checked)}
                    inputProps={{
                      'aria-describedby': 'bot-free-models-note',
                      'data-testid': 'BotSettings-FreeModelsSwitch',
                    }}
                  />
                }
                label='Free models (experimental)'
              />
              <Typography variant='caption' id='bot-free-models-note' sx={{color: 'text.secondary', mt: '-0.5em'}}>
                {FREE_MODELS_DISCLOSURE}
              </Typography>
            </>
          )}
        </Box>
        <Box sx={{display: 'flex', flexDirection: 'column', gap: '0.75em'}}>
          <Typography variant='subtitle2' component='label' htmlFor='bot-openrouter-api-key' sx={{fontWeight: 600}}>
            Open Router API Key
          </Typography>
          <InputBase
            fullWidth
            type={isEditing ? 'text' : 'password'}
            value={localApiKey}
            placeholder='Paste your OpenRouter API Key…'
            onChange={(event: ChangeEvent<HTMLInputElement>) => setLocalApiKey(event.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            sx={{
              fontSize: 14,
              backgroundColor: (theme) => theme.palette.mode === 'dark' ?
                'rgba(255,255,255,0.08)' :
                'rgba(0,0,0,0.04)',
              borderRadius: 2,
              px: 2,
              py: 1,
            }}
            inputProps={{
              'data-testid': 'BotSettings-ApiKeyInput',
              'id': 'bot-openrouter-api-key',
              'aria-describedby': 'bot-openrouter-api-key-note',
            }}
          />
          <Typography variant='caption' id='bot-openrouter-api-key-note' sx={{color: 'text.secondary'}}>
            Optional. Without a key, the assistant uses Bldrs&apos; hosted models within your plan&apos;s credits.
            A key is kept in this tab only, forgotten when you reload, and sent to OpenRouter and nowhere else.
          </Typography>
        </Box>
      </Box>
      <Box sx={{display: 'flex', justifyContent: 'flex-end', gap: '0.5em'}}>
        <Button
          variant='contained'
          onClick={handleSave}
          data-testid='BotSettings-OkButton'
        >
          OK
        </Button>
      </Box>
    </Box>
  )
}


/**
 * What the free-models switch says before anyone turns it on (#1934). The
 * relay still sends these requests with `data_collection: "deny"`
 * (ai-chat.js), so OpenRouter routes them only to providers it records as
 * not collecting prompts; but free providers' records are the least settled
 * (OpenRouter calls its data-policy tags "our best knowledge"), and they
 * change often, so the text doesn't promise more than that.
 */
export const FREE_MODELS_DISCLOSURE =
  'Free models cost no credits, but requests may be rate-limited or refused when the shared free pool is busy, ' +
  'and replies can be slower or weaker. Bldrs asks every provider not to store or train on your prompts, but free ' +
  'providers set their own terms and may log or train on prompts, so don\'t send anything sensitive.'


/**
 * The Pro model menu: the default first, then the relay's list with each
 * model's listed price. Models the relay can't serve under its privacy
 * settings aren't in the list at all (aiCatalogue.js), and the caption says
 * so.
 *
 * @param props
 * @return the menu and its caption
 */
function ModelMenu({catalogue, value, disabled, onChange}: ModelMenuProps): ReactElement {
  const models = (catalogue.value?.models ?? []).filter((m) => m.tiers.includes('pro') && m.id !== catalogue.value?.default)
  const known = value === '' || models.some((m) => m.id === value)
  return (
    <>
      <TextField
        select
        fullWidth
        size='small'
        label='Model'
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        SelectProps={{MenuProps: {PaperProps: {sx: {maxHeight: MENU_MAX_HEIGHT}}}}}
        inputProps={{'data-testid': 'BotSettings-ModelSelect'}}
        helperText={disabled ? 'Free models are on, so this choice waits until you turn them off.' : undefined}
      >
        <MenuItem value=''>
          <ListItemText primary={`Default: ${DEFAULT_MODEL_LABEL}`} secondary='Bldrs&apos; pick, with two fallbacks'/>
        </MenuItem>
        {!known && (
          <MenuItem value={value}>
            <ListItemText primary={value} secondary='Not in the current list'/>
          </MenuItem>
        )}
        {models.map((m) => (
          <MenuItem key={m.id} value={m.id} data-model-id={m.id}>
            <ListItemText primary={m.name} secondary={priceLabel(m.price)}/>
          </MenuItem>
        ))}
      </TextField>
      <Typography variant='caption' sx={{color: 'text.secondary'}} data-testid='BotSettings-ModelNote'>
        {catalogue.status === 'loading' ? 'Loading models…' : catalogueNote(catalogue.value)}
      </Typography>
    </>
  )
}


/**
 * @param value the relay's catalogue, or null when it couldn't be read
 * @return the caption under the menu
 */
function catalogueNote(value: Catalogue | null): string {
  if (!value || value.source !== 'live') {
    return 'Couldn\'t load the full model list, so only Bldrs\' standard models are shown. Try again later.'
  }
  return 'Prices are per million tokens, input / output, as OpenRouter lists them; your credits are charged ' +
    'what each request actually costs. Only models that can answer without the provider keeping your prompts ' +
    'are listed.'
}


/**
 * @param price USD per million tokens
 * @return e.g. "$1.00 / $5.00 per M tokens"
 */
export function priceLabel(price: {input: number, output: number}): string {
  return `${formatUsd(price.input)} / ${formatUsd(price.output)} per M tokens`
}


/**
 * Rounded up, never down, so a shown price doesn't understate one.
 *
 * @param usd
 * @return dollars with cents from $1 up, and two significant digits below
 */
function formatUsd(usd: number): string {
  if (!(usd > 0)) {
    return '$0'
  }
  // The decimals that keep two significant digits below $1, cents above.
  const decimals = usd >= 1 ? 2 : 1 - Math.floor(Math.log10(usd))
  const scale = 10 ** decimals
  // The slack keeps a price that is exact in decimal (0.09) from rounding
  // up past itself on its binary float error.
  const rounded = Math.ceil((usd * scale) - FLOAT_SLACK) / scale
  return `$${usd >= 1 ? rounded.toFixed(2) : String(rounded)}`
}
const FLOAT_SLACK = 1e-9


/**
 * The relay's catalogue, fetched when the picker is shown.
 *
 * @param enabled whether the picker is shown
 * @param load the loader
 * @return `{status, value}`
 */
function useCatalogue(enabled: boolean, load: () => Promise<Catalogue | null>): CatalogueState {
  const [state, setState] = useState<CatalogueState>({status: 'idle', value: null})
  useEffect(() => {
    if (!enabled) {
      return undefined
    }
    let live = true
    setState({status: 'loading', value: null})
    load().then((value) => {
      if (live) {
        setState({status: 'ready', value})
      }
    }, () => {
      if (live) {
        setState({status: 'ready', value: null})
      }
    })
    return () => {
      live = false
    }
  }, [enabled, load])
  return state
}


const MENU_MAX_HEIGHT = 360


interface CatalogueModel {
  id: string
  name: string
  price: {input: number, output: number}
  tiers: string[]
}

interface Catalogue {
  source: string
  default: string
  free: string
  models: CatalogueModel[]
}

interface CatalogueState {
  status: 'idle' | 'loading' | 'ready'
  value: Catalogue | null
}

interface ModelMenuProps {
  catalogue: CatalogueState
  value: string
  disabled: boolean
  onChange: (value: string) => void
}

interface ModelChoice {
  freeModels: boolean
  model: string | null
}

type BotSettingsProps = {
  apiKey: string
  onApiKeyChange: (value: string) => void
  onClose: () => void
  /** The saved model choice (assistModelChoice.js). */
  modelChoice?: ModelChoice
  onModelChoiceChange?: (choice: ModelChoice) => void
  /** Whether the account is Pro: only Pro gets the model menu. */
  isPro?: boolean
  /** For tests: the catalogue loader. */
  loadCatalogue?: () => Promise<Catalogue | null>
}
