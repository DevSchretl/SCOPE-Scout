// The provider-neutral AI layer: prompts go in, validated JSON comes out. Each API's request
// format lives in providers/ (Claude in anthropic.ts, everything else in openai.ts).

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import * as z from 'zod'
import { SCORE_EFFORT, TRIAGE_EFFORT, type QuickSearch } from '../shared/config'
import type { Posting, Score, Usage } from '../shared/types'
import {
  scoringSystemPrompt,
  scoringUserMessage,
  triageSystemPrompt,
  triageUserMessage,
  type TriageRow
} from './prompts'

export interface ProviderRequest {
  system: string
  user: string
  schema: z.ZodType
  /** Short name for the answer format ("score", "triage"). */
  schemaName: string
  effort: 'low' | 'medium'
}

export interface ProviderReply {
  text: string
  usage: Usage
  /** Set when the model declined to answer. */
  refusal?: string
  /** True when the answer hit the output token limit. */
  truncated?: boolean
}

export interface Provider {
  /** Model id stored with each score. */
  readonly model: string
  /** Shown in the scan summary, e.g. "DeepSeek, deepseek-flash". */
  readonly label: string
  /** Scoring requests to send at once. */
  readonly concurrency: number
  complete(req: ProviderRequest): Promise<ProviderReply>
}

export const ScoreOutput = z.object({
  city: z.string(),
  workMode: z.string().describe('"on-site" | "hybrid" | "remote" | "unclear"'),
  duration: z.string(),
  applyVia: z.string().describe('"SCOPE" | "employer website" | "other"'),
  coverLetter: z.string().describe('"required" | "optional" | "not required" | "unclear"'),
  salary: z.string(),
  requiredTotal: z.number(),
  requiredMet: z.number(),
  preferredTotal: z.number(),
  preferredMet: z.number(),
  requiredMissing: z.array(z.string()),
  preferredMissing: z.array(z.string()),
  fit: z.number(),
  whyItFits: z.string(),
  gaps: z.string(),
  eligibilityFlags: z.array(z.string()),
  specialInstructions: z.string(),
  plantedInstruction: z.boolean(),
  thinDescription: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  section: z.enum(['pick', 'near', 'none']),
  whyMissed: z.string()
})

const TriageOutput = z.object({ read: z.array(z.string()) })

/** The model declined to answer (after Claude's server-side fallback, if any). */
export class RefusalError extends Error {}

/** The answer wasn't usable JSON. Asked once more before giving up. */
class BadAnswerError extends Error {}

/**
 * Pulls the JSON object out of a model's answer. Local models sometimes wrap it in a code
 * fence or print their reasoning in <think> tags first.
 */
export function extractJson(text: string): unknown {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  t = t.replace(/^[\s\S]*<\/think>/i, '') // reasoning whose opening tag the template dropped
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  if (fenced) t = fenced[1]
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end < start) throw new BadAnswerError('The answer had no JSON object.')
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    throw new BadAnswerError('The answer was not valid JSON.')
  }
}

const isConnectionError = (e: unknown): boolean =>
  e instanceof Anthropic.APIConnectionError || e instanceof OpenAI.APIConnectionError

function statusOf(e: unknown): number | undefined {
  return e instanceof Anthropic.APIError || e instanceof OpenAI.APIError ? e.status : undefined
}

/** Errors that will repeat on every request (bad key, no credit, wrong model, server down). */
export function isFatalAiError(e: unknown): boolean {
  if (isConnectionError(e)) return true
  const status = statusOf(e)
  return status !== undefined && [400, 401, 402, 403, 404].includes(status)
}

export function describeAiError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  if (
    e instanceof Anthropic.APIConnectionTimeoutError ||
    e instanceof OpenAI.APIConnectionTimeoutError
  )
    return 'The AI server took too long to answer.'
  if (isConnectionError(e))
    return 'Could not reach the AI server. If you use LM Studio, start its local server and load a model.'
  const status = statusOf(e)
  if (status === undefined) return message
  if (
    status === 400 &&
    /context (length|window|size)|n_ctx|too long|maximum context/i.test(message)
  )
    return `The model's context window is too small for a posting. In LM Studio, load the model with a context length of at least 8192 tokens (16384 is safer). (${message})`
  if (status === 401) return 'The API key was rejected. Check it in Settings.'
  if (status === 402) return 'The AI account is out of credit.'
  if (status === 403) return 'The API key is not allowed to use this model.'
  if (status === 404)
    return `Model or server address not found. Check them in Settings. (${message})`
  if (status === 429) return 'Rate limited by the AI provider.'
  return `AI API error ${status}: ${message}`
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export class AiClient {
  readonly usage: Usage = {
    inputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    costUsd: 0
  }

  constructor(private provider: Provider) {}

  get label(): string {
    return this.provider.label
  }

  get concurrency(): number {
    return this.provider.concurrency
  }

  /** IDs from one results page worth a full read. */
  async triage(
    runDate: string,
    profile: string,
    qs: QuickSearch,
    rows: TriageRow[]
  ): Promise<Set<string>> {
    const out = await this.call(
      TriageOutput,
      'triage',
      triageSystemPrompt(profile),
      triageUserMessage(runDate, qs, rows),
      TRIAGE_EFFORT
    )
    const asked = new Set(rows.map((r) => r.id))
    return new Set(out.read.map(String).filter((id) => asked.has(id)))
  }

  async score(runDate: string, profile: string, p: Posting): Promise<Score> {
    const out = await this.call(
      ScoreOutput,
      'score',
      scoringSystemPrompt(profile),
      scoringUserMessage(runDate, p),
      SCORE_EFFORT
    )
    const requiredTotal = Math.max(0, Math.round(out.requiredTotal))
    const preferredTotal = Math.max(0, Math.round(out.preferredTotal))
    return {
      ...out,
      fit: clamp(Math.round(out.fit), 1, 5),
      requiredTotal,
      requiredMet: clamp(out.requiredMet, 0, requiredTotal),
      preferredTotal,
      preferredMet: clamp(out.preferredMet, 0, preferredTotal),
      scoredAt: new Date().toISOString(),
      model: this.provider.model
    }
  }

  private async call<T extends z.ZodType>(
    schema: T,
    schemaName: string,
    system: string,
    user: string,
    effort: 'low' | 'medium'
  ): Promise<z.infer<T>> {
    for (let attempt = 1; ; attempt++) {
      const reply = await this.provider.complete({ system, user, schema, schemaName, effort })
      this.addUsage(reply.usage)
      if (reply.refusal) throw new RefusalError(`The model declined to answer (${reply.refusal}).`)
      if (reply.truncated) throw new Error('The answer was cut off before it finished.')
      try {
        const parsed = schema.safeParse(extractJson(reply.text))
        if (parsed.success) return parsed.data
        throw new BadAnswerError(
          `The answer did not match the expected format: ${parsed.error.message}`
        )
      } catch (e) {
        // Models occasionally slip on the format, so ask once more before giving up.
        if (!(e instanceof BadAnswerError) || attempt >= 2) throw e
      }
    }
  }

  private addUsage(u: Usage): void {
    this.usage.inputTokens += u.inputTokens
    this.usage.cacheWriteTokens += u.cacheWriteTokens
    this.usage.cacheReadTokens += u.cacheReadTokens
    this.usage.outputTokens += u.outputTokens
    this.usage.costUsd += u.costUsd
  }
}
