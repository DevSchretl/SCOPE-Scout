// Data shapes shared by the main process, the preload bridge and the UI.
// Timestamps are ISO strings in UTC ("2026-10-04T15:02:11.000Z").
// Deadlines are SCOPE's Pacific wall-clock time without an offset ("2026-10-09T09:00").

export type MyStatus = '' | 'To apply' | 'Drafting' | 'Applied' | 'Skip'
export const MY_STATUSES: MyStatus[] = ['', 'To apply', 'Drafting', 'Applied', 'Skip']

/** One row of a SCOPE results page, refreshed on every scan. */
export interface Listing {
  title: string
  org: string
  location: string
  deadlineText: string
  deadline: string | null
  applicants: number | null
  /** SCOPE's application status column; "-" until you apply. */
  appStatus: string
}

export type ScoreSection = 'pick' | 'near' | 'none'

/**
 * The AI's reading of a posting (reader brief output). Imported rows from the old
 * workbook can be partial, so everything except `section` is optional.
 */
export interface Score {
  section: ScoreSection
  fit?: number
  requiredTotal?: number
  requiredMet?: number
  preferredTotal?: number
  preferredMet?: number
  requiredMissing?: string[]
  preferredMissing?: string[]
  whyItFits?: string
  gaps?: string
  eligibilityFlags?: string[]
  specialInstructions?: string
  /** True when the posting plants an instruction meant to catch AI tools. */
  plantedInstruction?: boolean
  thinDescription?: boolean
  confidence?: 'high' | 'medium' | 'low'
  whyMissed?: string
  city?: string
  workMode?: string
  duration?: string
  applyVia?: string
  coverLetter?: string
  salary?: string
  scoredAt?: string
  /** Model id that produced the score, or "imported". */
  model?: string
}

export interface Posting {
  id: string
  /** Term label from the quick search that listed it, e.g. "W27". */
  term: string
  listing: Listing
  firstSeen: string
  lastSeen: string
  onScopeNow: boolean
  /** AI triage decision; undefined means not triaged yet. */
  triage?: 'read' | 'skip'
  /** Raw SCOPE fields from the posting page, once read in full. */
  details?: Record<string, string>
  fetchedAt?: string
  fetchError?: string
  score?: Score
  scoreError?: string
  myStatus: MyStatus
}

export interface Usage {
  inputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  outputTokens: number
  costUsd: number
}

export interface SummaryItem {
  id: string
  title: string
  org: string
  match: number | null
  deadlineText: string
}

export interface RunSummary {
  listed: number
  listedByTerm: Record<string, number>
  newListed: number
  triaged: number
  read: number
  scored: number
  newPicks: SummaryItem[]
  dueSoon: SummaryItem[]
  notes: string[]
}

export type RunStatus = 'done' | 'login-needed' | 'error'

export interface RunRecord {
  startedAt: string
  finishedAt: string
  status: RunStatus
  model: string
  summary: RunSummary
  usage: Usage
}

export interface StoreData {
  version: 1
  /** Candidate profile used by the scoring prompt (edited in Settings). */
  profile: string
  postings: Record<string, Posting>
  /** Newest last. */
  runs: RunRecord[]
}

export type ProviderId = 'anthropic' | 'deepseek' | 'lmstudio' | 'custom'

/**
 * How an OpenAI-compatible server is asked for JSON: a full JSON Schema (LM Studio, OpenAI,
 * Ollama), plain JSON mode (DeepSeek), or only the prompt (servers that support neither).
 */
export type JsonMode = 'json_schema' | 'json_object' | 'prompt'

/** One provider's settings. Prices are USD per million tokens (OpenAI-compatible providers). */
export interface ProviderConfig {
  model: string
  baseUrl: string
  jsonMode: JsonMode
  inputPrice: number
  outputPrice: number
}

export interface ProviderView extends ProviderConfig {
  hasKey: boolean
}

export interface SettingsView {
  provider: ProviderId
  providers: Record<ProviderId, ProviderView>
  profile: string
  /** Empty when a scan can run; otherwise what is missing. */
  problem: string
}

export interface ProviderUpdate extends Partial<ProviderConfig> {
  /** A new key to store; an empty string removes the stored key. */
  apiKey?: string
}

export interface SettingsUpdate {
  provider?: ProviderId
  providers?: Partial<Record<ProviderId, ProviderUpdate>>
  profile?: string
}

export type ModelList = { ok: true; models: string[] } | { ok: false; error: string }

export interface AppData {
  postings: Posting[]
  lastRun: RunRecord | null
  scanning: boolean
}

export type ScopeStatus = 'unknown' | 'checking' | 'logged-in' | 'login-needed' | 'error'

/** The bridge the preload script exposes to the UI as `window.api`. */
export interface Api {
  getData(): Promise<AppData>
  setStatus(id: string, status: MyStatus): Promise<void>
  startScan(): Promise<{ started: boolean; reason?: string }>
  openScope(): Promise<void>
  checkScope(): Promise<ScopeStatus>
  getSettings(): Promise<SettingsView>
  saveSettings(update: SettingsUpdate): Promise<SettingsView>
  /** Asks an OpenAI-compatible server which models it has (doubles as a connection test). */
  listModels(provider: ProviderId, baseUrl: string, apiKey: string): Promise<ModelList>
  onProgress(cb: (text: string) => void): () => void
  onScanDone(cb: (run: RunRecord) => void): () => void
  onScopeStatus(cb: (status: ScopeStatus) => void): () => void
}
