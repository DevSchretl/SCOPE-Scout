import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { DEFAULT_MODEL, MODELS } from '../shared/config'
import type { SettingsUpdate, SettingsView } from '../shared/types'
import { getStore, saveStore } from './store'

// The API key is encrypted with Windows DPAPI (Electron safeStorage) and never leaves
// the main process. The profile lives in the store so the importer can seed it.

interface SettingsFile {
  model: string
  apiKeyEnc?: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function read(): SettingsFile {
  const file = settingsPath()
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  return { model: DEFAULT_MODEL, ...saved }
}

function write(s: SettingsFile): void {
  const file = settingsPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file + '.tmp', JSON.stringify(s, null, 1))
  renameSync(file + '.tmp', file)
}

export function getModel(): string {
  const model = read().model
  return MODELS.some((m) => m.id === model) ? model : DEFAULT_MODEL
}

/** The saved key, or ANTHROPIC_API_KEY from the environment as a fallback. */
export function getApiKey(): string | null {
  const enc = read().apiKeyEnc
  if (enc) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return null
    }
  }
  return process.env.ANTHROPIC_API_KEY || null
}

export function getSettingsView(): SettingsView {
  return { model: getModel(), hasKey: !!getApiKey(), profile: getStore().profile }
}

export function updateSettings(update: SettingsUpdate): SettingsView {
  const s = read()
  if (update.model && MODELS.some((m) => m.id === update.model)) s.model = update.model
  if (update.apiKey !== undefined) {
    const key = update.apiKey.trim()
    if (!key) {
      delete s.apiKeyEnc
    } else {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          'Windows encryption is not available, so the API key cannot be stored safely.'
        )
      }
      s.apiKeyEnc = safeStorage.encryptString(key).toString('base64')
    }
  }
  write(s)
  if (update.profile !== undefined) {
    getStore().profile = update.profile
    saveStore()
  }
  return getSettingsView()
}
