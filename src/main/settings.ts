import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { PROVIDERS, presetOf, type ProviderPreset } from '../shared/config'
import type {
  JsonMode,
  ProviderConfig,
  ProviderId,
  ProviderView,
  SettingsUpdate,
  SettingsView
} from '../shared/types'
import { getStore, saveStore } from './store'

// Each provider keeps its own settings, so switching between them loses nothing.
// API keys are encrypted with Windows DPAPI (Electron safeStorage) and never leave the
// main process. The profile lives in the store so the importer can seed it.

interface StoredProvider extends Partial<ProviderConfig> {
  apiKeyEnc?: string
}

interface SettingsFile {
  provider: ProviderId
  providers: Partial<Record<ProviderId, StoredProvider>>
}

const JSON_MODES: JsonMode[] = ['json_schema', 'json_object', 'prompt']
const isProvider = (id: unknown): id is ProviderId => PROVIDERS.some((p) => p.id === id)

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function read(): SettingsFile {
  const file = settingsPath()
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const providers: SettingsFile['providers'] = { ...(saved.providers ?? {}) }
  // Settings from before providers existed: a Claude model and key at the top level.
  if (!saved.providers && (saved.model || saved.apiKeyEnc)) {
    providers.anthropic = { model: saved.model, apiKeyEnc: saved.apiKeyEnc }
  }
  return { provider: isProvider(saved.provider) ? saved.provider : 'anthropic', providers }
}

function write(s: SettingsFile): void {
  const file = settingsPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file + '.tmp', JSON.stringify(s, null, 1))
  renameSync(file + '.tmp', file)
}

function configOf(s: SettingsFile, id: ProviderId): ProviderConfig {
  const stored = s.providers[id] ?? {}
  const d = presetOf(id).defaults
  return {
    model: stored.model ?? d.model,
    baseUrl: stored.baseUrl ?? d.baseUrl,
    jsonMode: stored.jsonMode ?? d.jsonMode,
    inputPrice: stored.inputPrice ?? d.inputPrice,
    outputPrice: stored.outputPrice ?? d.outputPrice
  }
}

/** The saved key for a provider, or its environment variable as a fallback. */
function keyOf(s: SettingsFile, id: ProviderId): string | null {
  const enc = s.providers[id]?.apiKeyEnc
  if (enc) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return null
    }
  }
  const env = presetOf(id).keyEnv
  return (env && process.env[env]) || null
}

export function storedApiKey(id: ProviderId): string | null {
  return keyOf(read(), id)
}

export interface ActiveProvider {
  preset: ProviderPreset
  config: ProviderConfig
  apiKey: string | null
  /** What stops a scan from running, or '' when everything is set. */
  problem: string
}

export function getActiveProvider(): ActiveProvider {
  const s = read()
  const preset = presetOf(s.provider)
  const config = configOf(s, s.provider)
  const apiKey = keyOf(s, s.provider)
  let problem = ''
  if (preset.needsKey && !apiKey) problem = `Add your ${preset.label} API key in Settings.`
  else if (preset.kind === 'openai' && !config.baseUrl)
    problem = `Add the ${preset.label} server URL in Settings.`
  else if (!config.model) problem = `Choose a ${preset.label} model in Settings.`
  else if (!getStore().profile.trim()) problem = 'Add your profile in Settings.'
  return { preset, config, apiKey, problem }
}

export function getSettingsView(): SettingsView {
  const s = read()
  const providers = Object.fromEntries(
    PROVIDERS.map((p): [ProviderId, ProviderView] => [
      p.id,
      { ...configOf(s, p.id), hasKey: !!keyOf(s, p.id) }
    ])
  ) as Record<ProviderId, ProviderView>
  return {
    provider: s.provider,
    providers,
    profile: getStore().profile,
    problem: getActiveProvider().problem
  }
}

const price = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined

/** Applies an update from the UI, checking every field since it comes from the renderer. */
export function updateSettings(update: SettingsUpdate): SettingsView {
  const s = read()
  if (isProvider(update.provider)) s.provider = update.provider
  for (const [id, u] of Object.entries(update.providers ?? {})) {
    if (!isProvider(id) || !u) continue
    const stored: StoredProvider = { ...(s.providers[id] ?? {}) }
    if (typeof u.model === 'string') stored.model = u.model.trim()
    if (typeof u.baseUrl === 'string') stored.baseUrl = u.baseUrl.trim().replace(/\/+$/, '')
    if (JSON_MODES.includes(u.jsonMode as JsonMode)) stored.jsonMode = u.jsonMode
    if (price(u.inputPrice) !== undefined) stored.inputPrice = price(u.inputPrice)
    if (price(u.outputPrice) !== undefined) stored.outputPrice = price(u.outputPrice)
    if (typeof u.apiKey === 'string') {
      const key = u.apiKey.trim()
      if (!key) {
        delete stored.apiKeyEnc
      } else {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error(
            'Windows encryption is not available, so the API key cannot be stored safely.'
          )
        }
        stored.apiKeyEnc = safeStorage.encryptString(key).toString('base64')
      }
    }
    s.providers[id] = stored
  }
  write(s)
  if (typeof update.profile === 'string') {
    getStore().profile = update.profile
    saveStore()
  }
  return getSettingsView()
}
