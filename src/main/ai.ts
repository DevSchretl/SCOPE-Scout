// All Claude API calls live here, so another provider would only touch this file.

import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod'
import { MODELS, SCORE_EFFORT, TRIAGE_EFFORT, type QuickSearch } from '../shared/config'
import type { Posting, Score, Usage } from '../shared/types'
import {
  scoringSystemPrompt,
  scoringUserMessage,
  triageSystemPrompt,
  triageUserMessage,
  type TriageRow
} from './prompts'

const ScoreOutput = z.object({
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

/** The model declined (stop_reason "refusal") even after the server-side fallback. */
export class RefusalError extends Error {}

/** Errors that will repeat on every request (bad key, no credit, unknown model). */
export function isFatalAiError(e: unknown): boolean {
  return (
    e instanceof Anthropic.AuthenticationError ||
    e instanceof Anthropic.PermissionDeniedError ||
    e instanceof Anthropic.NotFoundError ||
    e instanceof Anthropic.BadRequestError
  )
}

export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError)
    return 'The Claude API key was rejected. Check it in Settings.'
  if (e instanceof Anthropic.PermissionDeniedError)
    return 'The Claude API key is not allowed to use this model.'
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the Claude API.'
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API.'
  if (e instanceof Anthropic.APIError)
    return `Claude API error ${e.status ?? ''}: ${e.message}`.trim()
  return e instanceof Error ? e.message : String(e)
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export class AiClient {
  private client: Anthropic
  readonly usage: Usage = {
    inputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    costUsd: 0
  }

  constructor(
    apiKey: string,
    private model: string
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 4 })
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
      model: this.model
    }
  }

  private async call<T extends z.ZodType>(
    schema: T,
    system: string,
    user: string,
    effort: 'low' | 'medium'
  ): Promise<z.infer<T>> {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      // A rare false-positive refusal is retried on another model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // The rubric and profile are identical across a scan, so they are cached.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { effort, format: betaZodOutputFormat(schema) }
    })
    this.addUsage(res.usage)
    if (res.stop_reason === 'refusal') {
      throw new RefusalError(
        `Claude declined to score this posting (${res.stop_details?.category ?? 'no category'}).`
      )
    }
    if (res.stop_reason === 'max_tokens')
      throw new Error('The answer was cut off before it finished.')
    // After a fallback, the final model's answer is the last text block.
    const text = res.content.filter((b) => b.type === 'text').at(-1)
    if (!text || text.type !== 'text') throw new Error('The answer had no text.')
    const parsed = schema.safeParse(JSON.parse(text.text))
    if (!parsed.success)
      throw new Error(`The answer did not match the expected format: ${parsed.error.message}`)
    return parsed.data
  }

  private addUsage(u: Anthropic.Beta.BetaUsage): void {
    const price = MODELS.find((m) => m.id === this.model) ?? MODELS[0]
    const input = u.input_tokens ?? 0
    const write = u.cache_creation_input_tokens ?? 0
    const read = u.cache_read_input_tokens ?? 0
    const output = u.output_tokens ?? 0
    this.usage.inputTokens += input
    this.usage.cacheWriteTokens += write
    this.usage.cacheReadTokens += read
    this.usage.outputTokens += output
    this.usage.costUsd +=
      (input * price.input +
        write * price.cacheWrite +
        read * price.cacheRead +
        output * price.output) /
      1e6
  }
}
