# Spec: Bot Chat (AI Assistant)

## Overview
AI chat assistant that can answer questions about the loaded BIM model. Uses OpenRouter API to connect to LLMs. Can read selected element properties and respond with structured commands (e.g., select elements).

## Key Files
| File | Role |
|------|------|
| `src/Components/Bot/BotChat.jsx` | Chat UI: message list, input, settings toggle |
| `src/Components/Bot/BotSettings.tsx` | API key input panel |
| `src/Components/Bot/openRouterClient.ts` | `askLLM()` — OpenRouter API call |
| `src/Components/Bot/ChatMessage.jsx` | Individual message bubble rendering |
| `src/Components/Bot/eval.js` | `safeJsonFromCodeBlock()` — parse LLM JSON responses |
| `src/Components/Bot/BotControl.jsx` | Toggle button for bot visibility |
| `src/store/BotSlice.js` | Zustand: `isBotVisible` |

## Behavior
1. User enters OpenRouter API key (stored in localStorage)
2. User types a message
3. Selected elements' IFC properties are fetched and included as context
4. Message + context sent to OpenRouter API via `askLLM()`
5. LLM response parsed — may contain JSON commands (e.g., element selection)
6. Response displayed as chat bubble
7. If response contains structured commands, they're executed on the viewer

## API Integration
- **Provider:** OpenRouter (supports multiple LLM backends)
- **Auth:** User-provided API key
- **Endpoint:** Via `openRouterClient.ts`
- **Context:** Selected element properties serialized as prompt context

## Security Concerns
- API key stored in plain text in `localStorage` under key `openrouter_api_key`
- Any XSS vulnerability can exfiltrate the key
- Consider session-only storage or encryption
