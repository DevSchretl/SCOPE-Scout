// One scan: list both quick searches, triage new rows, read the chosen postings,
// score everything that has text but no score, then summarise.

import {
  DUE_SOON_DAYS,
  DUE_SOON_MIN_MATCH,
  FETCH_DELAY_MS,
  NEW_PICK_MIN_MATCH,
  QUICK_SEARCHES
} from '../shared/config'
import {
  cleanTitle,
  daysLeft,
  parseApplicants,
  parseDeadline,
  postingMatch,
  sectionOf
} from '../shared/derive'
import type {
  Listing,
  Posting,
  RunRecord,
  RunStatus,
  RunSummary,
  SummaryItem
} from '../shared/types'
import { AiClient, describeAiError, isFatalAiError } from './ai'
import { AnthropicProvider } from './providers/anthropic'
import { OpenAiProvider } from './providers/openai'
import * as scope from './scope'
import { getActiveProvider } from './settings'
import { backupStore, getStore, saveStore } from './store'

let running = false

export function isScanning(): boolean {
  return running
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** An AI client for the provider chosen in Settings; throws when something is missing. */
function createAi(): AiClient {
  const { preset, config, apiKey, problem } = getActiveProvider()
  if (problem) throw new Error(problem)
  return new AiClient(
    preset.kind === 'anthropic'
      ? new AnthropicProvider(config.model, apiKey ?? '')
      : new OpenAiProvider(preset, config, apiKey)
  )
}

/** Today's date in local time, for the prompts ("2026-10-04"). */
function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function item(p: Posting): SummaryItem {
  return {
    id: p.id,
    title: p.listing.title,
    org: p.listing.org,
    match: postingMatch(p),
    deadlineText: p.listing.deadlineText
  }
}

export async function runScan(progress: (text: string) => void): Promise<RunRecord> {
  if (running) throw new Error('A scan is already running.')
  running = true
  scope.setBusy(true)

  const startedAt = new Date().toISOString()
  const runDate = localDate()
  const store = getStore()
  const notes: string[] = []
  const listedByTerm: Record<string, number> = {}
  const seen = new Set<string>()
  const newIds = new Set<string>()
  const failedReads: string[] = []
  let triaged = 0
  let read = 0
  let scored = 0
  let status: RunStatus = 'done'
  let ai: AiClient | null = null
  /** Set when an AI error would repeat on every call; AI work stops, listing goes on. */
  let aiStopped: string | null = null

  try {
    ai = createAi()
    backupStore()

    let listingComplete = true
    try {
      for (const qs of QUICK_SEARCHES) {
        progress(`${qs.term}: opening "${qs.name}"`)
        if (!(await scope.openQuickSearch(qs.name))) {
          notes.push(`Quick search "${qs.name}" was not found on SCOPE.`)
          listingComplete = false
          continue
        }
        // SCOPE remembers the last page you viewed.
        if ((await scope.activePage()) !== 1) await scope.goToPage(1)

        for (let page = 1; ; page++) {
          progress(`${qs.term} page ${page}: listing`)
          const rows = await scope.listRows()
          const now = new Date().toISOString()
          for (const r of rows) {
            if (!r.id) continue
            const listing: Listing = {
              title: cleanTitle(r.title),
              org: r.org,
              location: r.location,
              deadlineText: r.deadline,
              deadline: parseDeadline(r.deadline),
              applicants: parseApplicants(r.applicants),
              appStatus: r.appStatus || '-'
            }
            const existing = store.postings[r.id]
            if (existing) {
              Object.assign(existing, { listing, lastSeen: now, onScopeNow: true })
            } else {
              store.postings[r.id] = {
                id: r.id,
                term: qs.term,
                listing,
                firstSeen: now,
                lastSeen: now,
                onScopeNow: true,
                myStatus: ''
              }
              newIds.add(r.id)
            }
            if (!seen.has(r.id)) listedByTerm[qs.term] = (listedByTerm[qs.term] ?? 0) + 1
            seen.add(r.id)
          }

          // Triage rows never triaged before. Ones you already applied to are in progress, not read.
          const untriaged = rows
            .map((r) => store.postings[r.id])
            .filter((p) => p && p.triage === undefined)
          for (const p of untriaged) if (p.listing.appStatus !== '-') p.triage = 'skip'
          const toTriage = rows.filter(
            (r) => r.canRead && store.postings[r.id]?.triage === undefined
          )
          if (toTriage.length && !aiStopped) {
            progress(`${qs.term} page ${page}: triaging ${toTriage.length} new postings`)
            try {
              const keep = await ai.triage(
                runDate,
                store.profile,
                qs,
                toTriage.map((r) => ({
                  id: r.id,
                  title: cleanTitle(r.title),
                  org: r.org,
                  location: r.location
                }))
              )
              for (const r of toTriage)
                store.postings[r.id].triage = keep.has(r.id) ? 'read' : 'skip'
              triaged += toTriage.length
            } catch (e) {
              // Left untriaged, so the next scan tries again.
              if (isFatalAiError(e)) aiStopped = describeAiError(e)
              notes.push(`Triage failed on ${qs.term} page ${page}: ${describeAiError(e)}`)
            }
          }

          // Read the chosen postings while they are on this page.
          const toRead = rows.filter((r) => {
            const p = store.postings[r.id]
            return r.canRead && p?.triage === 'read' && !p.details && !p.score
          })
          for (const [i, r] of toRead.entries()) {
            progress(`${qs.term} page ${page}: reading ${i + 1} of ${toRead.length}`)
            const res = await scope.readPosting(r.id)
            const p = store.postings[r.id]
            if (res.ok && res.fields) {
              p.details = res.fields
              p.fetchedAt = new Date().toISOString()
              delete p.fetchError
              read++
            } else if (res.error === 'LOGGED_OUT') {
              throw new scope.LoginNeededError()
            } else {
              p.fetchError = res.error ?? 'unknown error'
              failedReads.push(`${p.listing.title} (${p.listing.org}): ${p.fetchError}`)
            }
            await sleep(FETCH_DELAY_MS)
          }
          saveStore()

          const next = await scope.goToPage(page + 1)
          if (!next.ok) {
            if (next.reason && !next.reason.startsWith('no page')) {
              notes.push(`${qs.term}: stopped at page ${page} (${next.reason}).`)
              listingComplete = false
            }
            break
          }
        }
      }
    } catch (e) {
      if (!(e instanceof scope.LoginNeededError)) throw e
      status = 'login-needed'
      listingComplete = false
      notes.push('SCOPE login needed: click Open SCOPE, log in, then scan again.')
    }

    // Only a complete listing can tell which postings have left SCOPE.
    if (listingComplete && seen.size > 0) {
      for (const p of Object.values(store.postings)) if (!seen.has(p.id)) p.onScopeNow = false
    }
    if (failedReads.length)
      notes.push(`Could not read ${failedReads.length}: ${failedReads.join('; ')}`)

    // Score everything with text but no score: this scan's reads plus earlier leftovers.
    const pending = Object.values(store.postings).filter((p) => p.details && !p.score)
    const failedScores: string[] = []
    let done = 0
    const scoreOne = async (p: Posting): Promise<void> => {
      if (aiStopped || !ai) return
      try {
        p.score = await ai.score(runDate, store.profile, p)
        delete p.scoreError
        scored++
      } catch (e) {
        if (isFatalAiError(e)) aiStopped = describeAiError(e)
        p.scoreError = describeAiError(e)
        failedScores.push(`${p.listing.title} (${p.scoreError})`)
      }
      progress(`Scoring ${++done} of ${pending.length}`)
      saveStore()
    }
    const queue = [...pending]
    await Promise.all(
      Array.from({ length: ai.concurrency }, async () => {
        while (queue.length) await scoreOne(queue.shift()!)
      })
    )
    if (failedScores.length)
      notes.push(
        `Could not score ${failedScores.length} (retried next scan): ${failedScores.join('; ')}`
      )
    if (aiStopped) notes.push(`AI work stopped: ${aiStopped}`)
  } catch (e) {
    status = 'error'
    notes.push(describeAiError(e))
  } finally {
    running = false
    scope.setBusy(false)
  }

  const scoredNow = Object.values(store.postings).filter(
    (p) => p.score?.scoredAt && p.score.scoredAt >= startedAt && p.score.model !== 'imported'
  )
  for (const p of scoredNow) {
    if (p.score?.plantedInstruction)
      notes.push(
        `Planted instruction in ${p.listing.title} (${p.listing.org}): ${p.score.specialInstructions}`
      )
  }
  const picks = Object.values(store.postings).filter(
    (p) => sectionOf(p) === 'pick' && p.myStatus !== 'Skip'
  )
  const summary: RunSummary = {
    listed: seen.size,
    listedByTerm,
    newListed: newIds.size,
    triaged,
    read,
    scored,
    newPicks: scoredNow
      .filter((p) => sectionOf(p) === 'pick' && (postingMatch(p) ?? 0) >= NEW_PICK_MIN_MATCH)
      .sort((a, b) => (postingMatch(b) ?? 0) - (postingMatch(a) ?? 0))
      .map(item),
    dueSoon: picks
      .filter((p) => {
        const d = daysLeft(p.listing.deadline)
        const goodEnough = (postingMatch(p) ?? 0) >= DUE_SOON_MIN_MATCH
        return goodEnough && d !== null && d >= 0 && d <= DUE_SOON_DAYS
      })
      .sort((a, b) => (a.listing.deadline ?? '').localeCompare(b.listing.deadline ?? ''))
      .map(item),
    notes
  }
  const run: RunRecord = {
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    model: ai?.label ?? '',
    summary,
    usage: ai?.usage ?? {
      inputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      costUsd: 0
    }
  }
  store.runs.push(run)
  saveStore()
  return run
}
