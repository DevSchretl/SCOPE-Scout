import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { StoreData } from '../shared/types'

// Everything the app knows lives in one JSON file in %APPDATA%\SCOPE Scout\.
// tools/import_workbook.py writes the same format.

const MAX_RUNS = 100

let data: StoreData | null = null

export function storePath(): string {
  return join(app.getPath('userData'), 'scope-scout.json')
}

export function getStore(): StoreData {
  if (data) return data
  const file = storePath()
  const empty: StoreData = { version: 1, profile: '', postings: {}, runs: [] }
  data = existsSync(file) ? { ...empty, ...JSON.parse(readFileSync(file, 'utf8')) } : empty
  return data as StoreData
}

/** Atomic save: write a temp file, then swap it in. */
export function saveStore(): void {
  const store = getStore()
  if (store.runs.length > MAX_RUNS) store.runs = store.runs.slice(-MAX_RUNS)
  const file = storePath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file + '.tmp', JSON.stringify(store, null, 1))
  renameSync(file + '.tmp', file)
}

/** Keeps the pre-scan state next to the store, in case a scan goes wrong. */
export function backupStore(): void {
  const file = storePath()
  if (existsSync(file)) copyFileSync(file, join(dirname(file), 'scope-scout.backup.json'))
}
