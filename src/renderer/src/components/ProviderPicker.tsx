import { useState } from 'react'
import { Bot, Check, ChevronDown, Settings2 } from 'lucide-react'
import { CLAUDE_MODELS, PROVIDERS, presetOf } from '../../../shared/config'
import type { ProviderId, ProviderView, SettingsView } from '../../../shared/types'
import Popover from './Popover'

interface Props {
  settings: SettingsView | null
  disabled: boolean
  onChoose: (id: ProviderId) => void
  onOpenSettings: () => void
}

function modelName(model: string): string {
  return CLAUDE_MODELS.find((m) => m.id === model)?.label ?? model
}

/** What a provider still needs before it can scan, or '' when it is ready. */
function missing(id: ProviderId, v: ProviderView): string {
  const preset = presetOf(id)
  if (preset.needsKey && !v.hasKey) return 'Needs a key'
  if (preset.kind === 'openai' && !v.baseUrl) return 'Needs a server URL'
  if (!v.model) return 'Needs a model'
  return ''
}

export default function ProviderPicker({
  settings,
  disabled,
  onChoose,
  onOpenSettings
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const current = settings?.provider
  const model = current ? settings.providers[current].model : ''

  return (
    <Popover
      open={open}
      onOpenChange={(o) => setOpen(o)}
      buttonClass="provider-button"
      panelClass="provider-menu"
      disabled={disabled || !settings}
      title="Choose the AI that reads and scores postings"
      label={
        <>
          <Bot size={16} />
          <span>{current ? presetOf(current).label : 'Loading...'}</span>
          {current && <span className="provider-model">{modelName(model) || 'no model'}</span>}
          <ChevronDown size={16} className="chevron" />
        </>
      }
    >
      <div className="menu-label">AI provider</div>
      {settings &&
        PROVIDERS.map((p) => {
          const v = settings.providers[p.id]
          const need = missing(p.id, v)
          return (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={p.id === current}
              className="menu-item provider-item"
              onClick={() => {
                setOpen(false)
                if (p.id !== current) onChoose(p.id)
              }}
            >
              <span className="provider-item-text">
                <span className="provider-item-name">{p.label}</span>
                <span className="provider-item-model">
                  {modelName(v.model) || 'No model chosen'}
                </span>
              </span>
              <span className={need ? 'tag warn' : 'tag ok'}>{need || 'Ready'}</span>
              <Check size={16} className="check" />
            </button>
          )
        })}
      <div className="menu-sep" />
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          setOpen(false)
          onOpenSettings()
        }}
      >
        <Settings2 size={16} className="type-icon" />
        Models, keys and your profile
      </button>
    </Popover>
  )
}
