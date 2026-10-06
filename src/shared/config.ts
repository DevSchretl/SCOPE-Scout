// App settings that change rarely. Edit the quick searches when a new co-op cycle starts.

import type { ProviderConfig, ProviderId } from './types'

export const SCOPE_HOST = 'scope.sciencecoop.ubc.ca'
export const SCOPE_POSTINGS_URL = 'https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm'

export interface QuickSearch {
  /** Exact link text of the saved quick search on the SCOPE postings page. */
  name: string
  /** Term label stored on each posting. */
  term: string
  /** Tab label for this term's picks. */
  label: string
  /** Strict triage keeps only strong software or ML/AI fits. */
  strict: boolean
}

export const QUICK_SEARCHES: QuickSearch[] = [
  { name: 'W27 - All January 2027 Postings', term: 'W27', label: 'January picks', strict: false },
  { name: 'S27 - Early Summer 2027 Opportunities', term: 'S27', label: 'May backups', strict: true }
]

/** Pause between posting fetches so SCOPE isn't hammered. */
export const FETCH_DELAY_MS = 600
export const NEW_PICK_MIN_MATCH = 7
/** The summary's deadline alert covers picks closing within this many days, rated at least this. */
export const DUE_SOON_DAYS = 3
export const DUE_SOON_MIN_MATCH = 5

export interface ProviderPreset {
  id: ProviderId
  label: string
  /** "anthropic" uses the Claude SDK; everything else speaks the OpenAI chat format. */
  kind: 'anthropic' | 'openai'
  /** Defaults for a fresh install; you can change all of them in Settings. */
  defaults: ProviderConfig
  /** Suggestions for the model box. */
  models: string[]
  needsKey: boolean
  /** Scoring requests sent at once. Local servers work through one at a time. */
  concurrency: number
  /** Output token limit sent with each request (left out when undefined). */
  maxTokens?: number
  /** Low temperature keeps local models consistent; hosted models use their own default. */
  temperature?: number
  /** Where the key comes from, shown in Settings. */
  keyHint: string
  /** Environment variable read when no key is saved. */
  keyEnv?: string
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    kind: 'anthropic',
    defaults: {
      model: 'claude-opus-5-5',
      baseUrl: '',
      jsonMode: 'json_schema',
      inputPrice: 4,
      outputPrice: 20
    },
    models: ['claude-opus-5-5', 'claude-sonnet-5-5'],
    needsKey: true,
    concurrency: 3,
    keyHint: 'Create one at console.anthropic.com.',
    keyEnv: 'ANTHROPIC_API_KEY'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    // Peak-hour prices for deepseek-flash, so the cost shown is an upper bound.
    defaults: {
      model: 'deepseek-flash',
      baseUrl: 'https://api.deepseek.com',
      jsonMode: 'json_object',
      inputPrice: 0.3,
      outputPrice: 1.2
    },
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    needsKey: true,
    concurrency: 3,
    maxTokens: 16000,
    keyHint: 'Create one at platform.deepseek.com.',
    keyEnv: 'DEEPSEEK_API_KEY'
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    kind: 'openai',
    defaults: {
      model: '',
      baseUrl: 'http://localhost:1234/v1',
      jsonMode: 'json_schema',
      inputPrice: 0,
      outputPrice: 0
    },
    models: [],
    needsKey: false,
    concurrency: 1,
    temperature: 0.2,
    keyHint: 'Not needed for LM Studio.'
  },
  {
    id: 'custom',
    label: 'Other OpenAI-compatible server',
    kind: 'openai',
    defaults: { model: '', baseUrl: '', jsonMode: 'json_schema', inputPrice: 0, outputPrice: 0 },
    models: [],
    needsKey: false,
    concurrency: 2,
    temperature: 0.2,
    keyHint: 'Only if the server asks for one (Ollama does not; OpenRouter and OpenAI do).'
  }
]

export function presetOf(id: ProviderId): ProviderPreset {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}

export interface ClaudeModel {
  id: string
  label: string
  /** USD per million tokens. 5-minute cache writes cost 1.25x input. */
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export const CLAUDE_MODELS: ClaudeModel[] = [
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    input: 4,
    output: 20,
    cacheRead: 0.2,
    cacheWrite: 5
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5
  }
]

export const TRIAGE_EFFORT = 'low' as const
export const SCORE_EFFORT = 'medium' as const
