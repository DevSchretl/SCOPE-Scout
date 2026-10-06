import { useState } from 'react'
import { MODELS } from '../../../shared/config'
import type { SettingsUpdate, SettingsView } from '../../../shared/types'

interface Props {
  initial: SettingsView
  onClose: () => void
  onSaved: (view: SettingsView) => void
}

export default function Settings({ initial, onClose, onSaved }: Props): React.JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(initial.model)
  const [profile, setProfile] = useState(initial.profile)
  const [error, setError] = useState('')

  async function save(update: SettingsUpdate): Promise<void> {
    try {
      onSaved(await window.api.saveSettings(update))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label>
          Claude API key
          <input
            type="password"
            value={apiKey}
            autoComplete="off"
            placeholder={
              initial.hasKey ? 'A key is saved. Paste a new one to replace it.' : 'sk-ant-...'
            }
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <p className="hint">
          Stored encrypted on this PC with Windows DPAPI. Create one at console.anthropic.com.
          {initial.hasKey && (
            <button className="link" onClick={() => save({ apiKey: '' })}>
              Remove saved key
            </button>
          )}
        </p>

        <label>
          Model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} (${m.input} / ${m.output} per million tokens)
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          Opus 5.5 is the most careful scorer. Sonnet 5.5 costs about half as much.
        </p>

        <label>
          Your profile
          <textarea rows={16} value={profile} onChange={(e) => setProfile(e.target.value)} />
        </label>
        <p className="hint">
          The scorer only counts what is listed here as met: your year and grad date, programs,
          skills you have (with the project that proves each), skills you don&apos;t have, and where
          you can work.
        </p>

        {error && <p className="error">{error}</p>}
        <footer>
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={() =>
              save({ model, profile, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) })
            }
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
