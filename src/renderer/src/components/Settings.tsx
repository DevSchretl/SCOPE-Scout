import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { CLAUDE_MODELS, PROVIDERS, presetOf } from '../../../shared/config'
import type { JsonMode, ProviderId, ProviderUpdate, SettingsView } from '../../../shared/types'

interface Props {
  initial: SettingsView
  onClose: () => void
  onSaved: (view: SettingsView) => void
}

/** What the form holds for each provider until you press Save. */
interface Draft {
  model: string
  baseUrl: string
  jsonMode: JsonMode
  inputPrice: string
  outputPrice: string
  apiKey: string
  removeKey: boolean
}

const HINTS: Record<ProviderId, string> = {
  anthropic: 'Opus 5.5 is the most careful scorer. Sonnet 5.5 costs about half as much.',
  deepseek:
    'deepseek-flash is cheap and fast; deepseek-v4-pro is stronger. The prices are peak-hour rates, so the cost shown is an upper bound.',
  lmstudio:
    "In LM Studio's Developer tab, start the server and load a model with a context length of at least 8192 tokens, then click Check connection. Models under about 7B parameters often get the scoring format wrong.",
  custom:
    'Any server with an OpenAI-style chat completions endpoint, for example Ollama (http://localhost:11434/v1) or OpenRouter (https://openrouter.ai/api/v1). If scoring fails with a format error, try another JSON mode.'
}

const JSON_MODES: [JsonMode, string][] = [
  ['json_schema', 'JSON schema (LM Studio, Ollama, OpenAI)'],
  ['json_object', 'JSON object (DeepSeek)'],
  ['prompt', 'Prompt only (any server)']
]

export default function Settings({ initial, onClose, onSaved }: Props): React.JSX.Element {
  const [provider, setProvider] = useState<ProviderId>(initial.provider)
  const [drafts, setDrafts] = useState(
    () =>
      Object.fromEntries(
        PROVIDERS.map((p) => {
          const v = initial.providers[p.id]
          const draft: Draft = {
            model: v.model,
            baseUrl: v.baseUrl,
            jsonMode: v.jsonMode,
            inputPrice: String(v.inputPrice),
            outputPrice: String(v.outputPrice),
            apiKey: '',
            removeKey: false
          }
          return [p.id, draft]
        })
      ) as Record<ProviderId, Draft>
  )
  const [profile, setProfile] = useState(initial.profile)
  const [models, setModels] = useState<string[]>([])
  const [check, setCheck] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    // Capture, so Esc closes Settings and not a posting drawer behind it.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const preset = presetOf(provider)
  const d = drafts[provider]
  const hasKey = initial.providers[provider].hasKey && !d.removeKey
  const edit = (change: Partial<Draft>): void =>
    setDrafts((all) => ({ ...all, [provider]: { ...all[provider], ...change } }))

  function choose(id: ProviderId): void {
    setProvider(id)
    setModels([])
    setCheck('')
  }

  async function checkConnection(): Promise<void> {
    setCheck('Checking...')
    const res = await window.api.listModels(provider, d.baseUrl, d.apiKey)
    if (!res.ok) return setCheck(res.error)
    setModels(res.models)
    setCheck(
      res.models.length
        ? `Connected. ${res.models.length} model${res.models.length === 1 ? '' : 's'} available.`
        : 'Connected, but the server lists no models. Load one first.'
    )
    if (!d.model && res.models.length) edit({ model: res.models[0] })
  }

  async function save(): Promise<void> {
    const providers = Object.fromEntries(
      PROVIDERS.map((p) => {
        const x = drafts[p.id]
        const update: ProviderUpdate = {
          model: x.model,
          baseUrl: x.baseUrl,
          jsonMode: x.jsonMode,
          inputPrice: Number(x.inputPrice),
          outputPrice: Number(x.outputPrice)
        }
        if (x.apiKey.trim()) update.apiKey = x.apiKey.trim()
        else if (x.removeKey) update.apiKey = ''
        return [p.id, update]
      })
    )
    try {
      onSaved(await window.api.saveSettings({ provider, providers, profile }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const keyPlaceholder = hasKey
    ? 'A key is saved. Paste a new one to replace it.'
    : preset.needsKey
      ? 'Paste your API key'
      : 'Optional'
  const modelOptions = [...new Set([...preset.models, ...models])]

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <section className="form-section">
            <h3>AI provider</h3>
            <label>
              Provider
              <select value={provider} onChange={(e) => choose(e.target.value as ProviderId)}>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">{HINTS[provider]}</p>

            {preset.kind === 'openai' && (
              <label>
                Server URL
                <input
                  value={d.baseUrl}
                  placeholder="http://localhost:1234/v1"
                  onChange={(e) => edit({ baseUrl: e.target.value })}
                />
              </label>
            )}

            <label>
              API key
              <input
                type="password"
                value={d.apiKey}
                autoComplete="off"
                placeholder={keyPlaceholder}
                onChange={(e) => edit({ apiKey: e.target.value })}
              />
            </label>
            <p className="hint">
              {preset.keyHint} Keys are stored encrypted on this PC with Windows DPAPI.
              {hasKey && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => edit({ removeKey: true, apiKey: '' })}
                >
                  Remove saved key
                </button>
              )}
              {d.removeKey && ' The saved key will be removed when you save.'}
            </p>

            <label>
              Model
              {preset.kind === 'anthropic' ? (
                <select value={d.model} onChange={(e) => edit({ model: e.target.value })}>
                  {CLAUDE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} (${m.input} / ${m.output} per million tokens)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  list="model-options"
                  value={d.model}
                  placeholder="Model id, e.g. qwen2.5-14b-instruct"
                  onChange={(e) => edit({ model: e.target.value })}
                />
              )}
            </label>
            <datalist id="model-options">
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>

            {preset.kind === 'openai' && (
              <>
                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    onClick={checkConnection}
                    disabled={!d.baseUrl.trim()}
                  >
                    Check connection
                  </button>
                  <span className="muted">{check}</span>
                </div>
                <div className="grid3">
                  <label>
                    JSON mode
                    <select
                      value={d.jsonMode}
                      onChange={(e) => edit({ jsonMode: e.target.value as JsonMode })}
                    >
                      {JSON_MODES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Input $ per M tokens
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={d.inputPrice}
                      onChange={(e) => edit({ inputPrice: e.target.value })}
                    />
                  </label>
                  <label>
                    Output $ per M tokens
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={d.outputPrice}
                      onChange={(e) => edit({ outputPrice: e.target.value })}
                    />
                  </label>
                </div>
              </>
            )}
          </section>

          <section className="form-section">
            <h3>Your profile</h3>
            <textarea
              rows={14}
              aria-label="Your profile"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
            />
            <p className="hint">
              The scorer only counts what is listed here as met: your year and grad date, programs,
              skills you have (with the project that proves each), skills you don&apos;t have, and
              where you can work.
            </p>
          </section>

          {error && <p className="error-text">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save}>
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
