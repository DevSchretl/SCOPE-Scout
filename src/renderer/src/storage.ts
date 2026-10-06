// View settings remembered in localStorage between visits and restarts. Storage can be
// missing or unreadable, so every read and write is allowed to fail.

import { useState } from 'react'
import { validConditions, type Condition } from '../../shared/filters'
import { SORTS, type SortKey } from '../../shared/search'
import { SHEETS } from '../../shared/sheets'

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not remembering is fine.
  }
}

/** State kept in localStorage; `parse` turns whatever was stored into a valid value. */
export function useStored<T>(key: string, parse: (raw: unknown) => T): [T, (next: T) => void] {
  const [value, setValue] = useState(() => parse(read(key)))
  function set(next: T): void {
    setValue(next)
    write(key, next)
  }
  return [value, set]
}

const asRecord = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

/** The open sheet on the Postings page and each sheet's filters. */
export interface PostingsView {
  sheetId: string
  filters: Record<string, Condition[]>
}

export const POSTINGS_KEY = 'scout.postings'

export function parsePostingsView(raw: unknown): PostingsView {
  const r = asRecord(raw)
  const stored = asRecord(r.filters)
  const filters: Record<string, Condition[]> = {}
  for (const s of SHEETS) {
    const conditions = validConditions(stored[s.id])
    if (conditions.length) filters[s.id] = conditions
  }
  const sheetId = SHEETS.some((s) => s.id === r.sheetId) ? (r.sheetId as string) : SHEETS[0].id
  return { sheetId, filters }
}

/** The Search page's filters, sort and options. */
export interface SearchState {
  conditions: Condition[]
  sort: SortKey
  includeClosed: boolean
  includeGone: boolean
  advanced: boolean
}

export const SEARCH_KEY = 'scout.search'

export function parseSearchState(raw: unknown): SearchState {
  const r = asRecord(raw)
  return {
    conditions: validConditions(r.conditions),
    sort: SORTS.some((s) => s.key === r.sort) ? (r.sort as SortKey) : 'best',
    includeClosed: r.includeClosed !== false,
    includeGone: r.includeGone !== false,
    advanced: r.advanced === true
  }
}

export const RECENT_KEY = 'scout.recent'
export const MAX_RECENT = 8

export function parseRecent(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, MAX_RECENT)
    : []
}
