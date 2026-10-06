// App settings that change rarely. Edit the quick searches when a new co-op cycle starts.

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
export const SCORE_CONCURRENCY = 3
export const NEW_PICK_MIN_MATCH = 7
/** The summary's deadline alert covers picks closing within this many days, rated at least this. */
export const DUE_SOON_DAYS = 3
export const DUE_SOON_MIN_MATCH = 5

export interface ModelOption {
  id: string
  label: string
  /** USD per million tokens. */
  input: number
  output: number
  cacheRead: number
  /** 5-minute cache writes cost 1.25x input. */
  cacheWrite: number
}

export const MODELS: ModelOption[] = [
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
export const DEFAULT_MODEL = MODELS[0].id

export const TRIAGE_EFFORT = 'low' as const
export const SCORE_EFFORT = 'medium' as const
