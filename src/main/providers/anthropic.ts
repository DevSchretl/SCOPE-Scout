// Claude through the Anthropic SDK, with structured outputs, prompt caching and the
// server-side refusal fallback.

import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { CLAUDE_MODELS, presetOf } from '../../shared/config'
import type { Provider, ProviderReply, ProviderRequest } from '../ai'

export class AnthropicProvider implements Provider {
  readonly label: string
  readonly concurrency = presetOf('anthropic').concurrency
  private client: Anthropic

  constructor(
    readonly model: string,
    apiKey: string
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 4 })
    this.label = CLAUDE_MODELS.find((m) => m.id === model)?.label ?? model
  }

  async complete(req: ProviderRequest): Promise<ProviderReply> {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      // A rare false-positive refusal is retried on another model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // The rubric and profile are identical across a scan, so they are cached.
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: req.user }],
      output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) }
    })

    const price = CLAUDE_MODELS.find((m) => m.id === this.model) ?? CLAUDE_MODELS[0]
    const input = res.usage.input_tokens ?? 0
    const write = res.usage.cache_creation_input_tokens ?? 0
    const read = res.usage.cache_read_input_tokens ?? 0
    const output = res.usage.output_tokens ?? 0
    const costUsd =
      (input * price.input +
        write * price.cacheWrite +
        read * price.cacheRead +
        output * price.output) /
      1e6

    // After a fallback, the final model's answer is the last text block.
    const last = res.content.filter((b) => b.type === 'text').at(-1)
    return {
      text: last?.type === 'text' ? last.text : '',
      usage: {
        inputTokens: input,
        cacheWriteTokens: write,
        cacheReadTokens: read,
        outputTokens: output,
        costUsd
      },
      refusal:
        res.stop_reason === 'refusal' ? (res.stop_details?.category ?? 'no category') : undefined,
      truncated: res.stop_reason === 'max_tokens'
    }
  }
}
