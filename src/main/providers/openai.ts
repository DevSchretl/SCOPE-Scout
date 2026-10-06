// Any server that speaks the OpenAI chat-completions format: DeepSeek, LM Studio, Ollama,
// OpenRouter, OpenAI itself.

import OpenAI from 'openai'
import * as z from 'zod'
import type { ProviderPreset } from '../../shared/config'
import type { ProviderConfig } from '../../shared/types'
import type { Provider, ProviderReply, ProviderRequest } from '../ai'

/** Local servers ignore the key, but the SDK refuses to send a request without one. */
const NO_KEY = 'not-needed'

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = { ...(z.toJSONSchema(schema) as Record<string, unknown>) }
  delete json.$schema // strict servers reject the meta-schema keyword
  return json
}

export class OpenAiProvider implements Provider {
  readonly model: string
  readonly label: string
  readonly concurrency: number
  private client: OpenAI

  constructor(
    private preset: ProviderPreset,
    private config: ProviderConfig,
    apiKey: string | null,
    maxRetries = 3
  ) {
    this.model = config.model
    this.label = `${preset.label}, ${config.model}`
    this.concurrency = preset.concurrency
    this.client = new OpenAI({
      apiKey: apiKey || NO_KEY,
      baseURL: config.baseUrl,
      maxRetries,
      // Local models on a laptop can take minutes per posting.
      timeout: 10 * 60 * 1000
    })
  }

  async complete(req: ProviderRequest): Promise<ProviderReply> {
    const schema = jsonSchemaOf(req.schema)
    // Every mode gets the schema in the prompt: DeepSeek's JSON mode needs it, and it tells
    // the model what each field means.
    const system = `${req.system}\n\n# Answer format\n\nReply with one JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`

    const res = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: req.user }
      ],
      ...(this.config.jsonMode === 'json_schema'
        ? {
            response_format: {
              type: 'json_schema' as const,
              json_schema: { name: req.schemaName, schema, strict: true }
            }
          }
        : this.config.jsonMode === 'json_object'
          ? { response_format: { type: 'json_object' as const } }
          : {}),
      ...(this.preset.maxTokens ? { max_tokens: this.preset.maxTokens } : {}),
      ...(this.preset.temperature !== undefined ? { temperature: this.preset.temperature } : {})
    })

    const choice = res.choices[0]
    const input = res.usage?.prompt_tokens ?? 0
    const output = res.usage?.completion_tokens ?? 0
    return {
      text: choice?.message?.content ?? '',
      usage: {
        inputTokens: input,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        outputTokens: output,
        costUsd: (input * this.config.inputPrice + output * this.config.outputPrice) / 1e6
      },
      refusal:
        choice?.message?.refusal ||
        (choice?.finish_reason === 'content_filter' ? 'content filter' : undefined),
      truncated: choice?.finish_reason === 'length'
    }
  }
}

/** The model ids the server offers. Also a quick connection test for Settings. */
export async function listModels(baseUrl: string, apiKey: string | null): Promise<string[]> {
  const client = new OpenAI({
    apiKey: apiKey || NO_KEY,
    baseURL: baseUrl,
    maxRetries: 0,
    timeout: 15000
  })
  const ids: string[] = []
  for await (const m of client.models.list()) ids.push(m.id)
  return ids.sort()
}
