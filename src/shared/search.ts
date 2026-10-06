// Search over every posting: a small query language, a per-posting index, ranking and
// snippets. Pure functions, shared by the UI and its tests.
//
//   data analyst         both words; a word also finds longer words it starts ("dev" finds developer)
//   "machine learning"   the exact phrase
//   python -senior       leave a word out
//   react OR vue         either word
//   org:shopify          a word in one field (id, title, org, city, desc, req, notes, term, status)
//   in:title,org data    words without a prefix only look in these fields

import { daysLeft, postingMatch } from './derive'
import { fold, foldWithMap, isWordChar } from './text'
import type { Posting } from './types'

export type SearchField =
  'id' | 'title' | 'org' | 'city' | 'req' | 'desc' | 'notes' | 'term' | 'status'

/** The fields the advanced search's "Search in" boxes offer. */
export const SEARCH_IN: { field: SearchField; label: string }[] = [
  { field: 'title', label: 'Title' },
  { field: 'org', label: 'Organization' },
  { field: 'city', label: 'Location' },
  { field: 'desc', label: 'Description' },
  { field: 'req', label: 'Requirements' },
  { field: 'notes', label: 'AI notes' }
]

/** Examples for the search help. */
export const SEARCH_TIPS: { query: string; finds: string }[] = [
  { query: 'org:"Capital One"', finds: 'One organization' },
  { query: 'city:vancouver', finds: 'One city or province' },
  { query: '"machine learning"', finds: 'An exact phrase' },
  { query: 'python -senior', finds: 'Leave a word out' },
  { query: 'react OR vue', finds: 'Either word' },
  { query: 'in:title data', finds: 'Titles only' }
]

/** Prefix names you can type, including a couple of aliases. */
const PREFIXES: Record<string, SearchField> = {
  id: 'id',
  title: 'title',
  org: 'org',
  company: 'org',
  city: 'city',
  location: 'city',
  desc: 'desc',
  req: 'req',
  notes: 'notes',
  term: 'term',
  status: 'status'
}

/** Where words without a prefix look. Status only answers to "status:". */
const DEFAULT_FIELDS: SearchField[] = ['id', 'title', 'org', 'city', 'req', 'desc', 'notes', 'term']

const WEIGHTS: Record<SearchField, number> = {
  id: 100,
  title: 10,
  org: 8,
  city: 6,
  req: 3,
  desc: 1,
  notes: 1,
  term: 2,
  status: 2
}

export interface Term {
  /** As typed, without quotes or prefix. */
  text: string
  /** Was in closed quotes: only whole words match. */
  quoted: boolean
  field?: SearchField
}

export interface Query {
  /** Every term must match. */
  all: Term[]
  /** Each group needs one match ("a OR b"). */
  any: Term[][]
  /** No term may match. */
  none: Term[]
  /** Where words without a prefix look; empty means everywhere. */
  scope: SearchField[]
}

// ---------- Parsing ----------

type Token =
  | { kind: 'or' }
  | { kind: 'scope'; fields: SearchField[] }
  | { kind: 'term'; term: Term; negated: boolean }

const isSpace = (ch: string | undefined): boolean => !!ch && /\s/.test(ch)

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  const n = input.length
  let i = 0

  /** Reads a quoted run starting at input[i] === '"'. */
  const quoted = (): { text: string; closed: boolean } => {
    const end = input.indexOf('"', i + 1)
    const text = input.slice(i + 1, end < 0 ? n : end)
    i = end < 0 ? n : end + 1
    return { text: text.trim(), closed: end >= 0 }
  }
  const skipParens = (): void => {
    while (input[i] === ')') i++
  }

  while (i < n) {
    if (isSpace(input[i])) {
      i++
      continue
    }
    let negated = false
    if (input[i] === '-' && i + 1 < n && !isSpace(input[i + 1])) {
      negated = true
      i++
    }
    while (input[i] === '(') i++
    if (i >= n) break

    if (input[i] === '"') {
      const q = quoted()
      skipParens()
      if (q.text) tokens.push({ kind: 'term', term: { text: q.text, quoted: q.closed }, negated })
      continue
    }

    // A word, which may start with "name:". A quote right after the colon starts a phrase.
    let j = i
    while (j < n && !isSpace(input[j]) && !(input[j] === '"' && input[j - 1] === ':')) j++
    const word = input.slice(i, j)
    i = j
    const colon = word.indexOf(':')
    const name = colon > 0 ? word.slice(0, colon).toLowerCase() : ''

    if (name === 'in' && !negated) {
      const fields = word
        .slice(colon + 1)
        .replace(/\)+$/, '')
        .split(',')
        .map((f) => PREFIXES[f.trim().toLowerCase()])
        .filter((f): f is SearchField => !!f)
      tokens.push({ kind: 'scope', fields })
      continue
    }

    const field = PREFIXES[name]
    if (field) {
      let text = word.slice(colon + 1).replace(/\)+$/, '')
      let closed = false
      if (!text && input[i] === '"') {
        const q = quoted()
        text = q.text
        closed = q.closed
        skipParens()
      }
      if (text) tokens.push({ kind: 'term', term: { text, quoted: closed, field }, negated })
      continue
    }

    const text = word.replace(/\)+$/, '')
    if (!text) continue
    if (text === 'OR' && !negated) tokens.push({ kind: 'or' })
    else tokens.push({ kind: 'term', term: { text, quoted: false }, negated })
  }
  return tokens
}

export function parseQuery(input: string): Query {
  const query: Query = { all: [], any: [], none: [], scope: [] }
  const groups: Term[][] = []
  // True right after a positive term, so a following OR can join the next one to it.
  let afterTerm = false
  let join = false
  for (const t of tokenize(input)) {
    if (t.kind === 'or') {
      join = afterTerm
      continue
    }
    if (t.kind === 'scope') {
      for (const f of t.fields) if (!query.scope.includes(f)) query.scope.push(f)
    } else if (t.negated) {
      query.none.push(t.term)
    } else {
      if (join) groups[groups.length - 1].push(t.term)
      else groups.push([t.term])
      afterTerm = true
      join = false
      continue
    }
    afterTerm = false
    join = false
  }
  for (const g of groups) {
    if (g.length > 1) query.any.push(g)
    else query.all.push(g[0])
  }
  return query
}

const quote = (t: Term): string => {
  const text = t.text.replace(/"/g, '')
  return t.quoted || /\s/.test(text) || text === 'OR' ? `"${text}"` : text
}
const formatTerm = (t: Term): string => (t.field ? `${t.field}:` : '') + quote(t)

/** The query as text, in a standard order: words, OR groups, exclusions, then in:. */
export function formatQuery(q: Query): string {
  return [
    ...q.all.map(formatTerm),
    ...q.any
      .filter((g) => g.length)
      .map((g) => (g.length > 1 ? `(${g.map(formatTerm).join(' OR ')})` : formatTerm(g[0]))),
    ...q.none.map((t) => `-${formatTerm(t)}`),
    ...(q.scope.length ? [`in:${q.scope.join(',')}`] : [])
  ].join(' ')
}

export function isEmptyQuery(q: Query): boolean {
  return !q.all.length && !q.any.length && !q.none.length
}

// ---------- The advanced search form ----------

/** What the advanced search boxes show. */
export interface QueryForm {
  all: string
  phrase: string
  any: string
  none: string
  scope: SearchField[]
}

const isPlain = (t: Term): boolean => !t.field && !t.quoted && !/\s/.test(t.text)
const isPhrase = (t: Term): boolean => !t.field && (t.quoted || /\s/.test(t.text))

export function toForm(q: Query): QueryForm {
  const group = q.any.find((g) => g.every(isPlain))
  return {
    all: q.all
      .filter(isPlain)
      .map((t) => t.text)
      .join(' '),
    phrase: q.all.find(isPhrase)?.text ?? '',
    any: group ? group.map((t) => t.text).join(' ') : '',
    none: q.none
      .filter(isPlain)
      .map((t) => t.text)
      .join(' '),
    scope: [...q.scope]
  }
}

/** The query with the form's parts swapped in. Anything the form has no box for is kept. */
export function fromForm(form: QueryForm, base: Query): Query {
  const words = (s: string): Term[] =>
    s
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, quoted: false }))
  const phrase = base.all.find(isPhrase)
  const group = base.any.find((g) => g.every(isPlain))
  const anyWords = words(form.any)
  const phraseText = form.phrase.replace(/"/g, '').trim()
  return {
    all: [
      ...words(form.all),
      ...(phraseText ? [{ text: phraseText, quoted: true }] : []),
      ...base.all.filter((t) => !isPlain(t) && t !== phrase),
      // One "any" word is simply required.
      ...(anyWords.length === 1 ? anyWords : [])
    ],
    any: [...(anyWords.length > 1 ? [anyWords] : []), ...base.any.filter((g) => g !== group)],
    none: [...words(form.none), ...base.none.filter((t) => !isPlain(t))],
    scope: [...form.scope]
  }
}

// ---------- The index ----------

interface Entry {
  /** Display text per field, with runs of whitespace collapsed. */
  raw: Record<SearchField, string>
  folded: Record<SearchField, string>
}

const CITY_KEYS = ['Job Location', 'City', 'Province / State', 'Country']
/** SCOPE fields that have a search field of their own; the rest count as description. */
const OWN_KEYS = new Set([
  'Job Title',
  'Organization',
  'Job Description',
  'Job Requirements',
  ...CITY_KEYS
])

const joined = (parts: (string | undefined)[]): string =>
  parts
    .filter((x): x is string => !!x)
    .join(' · ')
    .replace(/\s+/g, ' ')
    .trim()

// A posting object never changes (a status change makes a new one), so entries can be cached.
const index = new WeakMap<Posting, Entry>()

function entryOf(p: Posting): Entry {
  const cached = index.get(p)
  if (cached) return cached
  const d = p.details ?? {}
  const s = p.score
  const raw: Record<SearchField, string> = {
    id: p.id,
    title: joined([p.listing.title, d['Job Title']]),
    org: joined([p.listing.org, d['Organization']]),
    city: joined([p.listing.location, s?.city, ...CITY_KEYS.map((k) => d[k])]),
    req: joined([
      d['Job Requirements'],
      ...(s?.requiredMissing ?? []),
      ...(s?.preferredMissing ?? [])
    ]),
    desc: joined([
      d['Job Description'],
      ...Object.entries(d)
        .filter(([k]) => !OWN_KEYS.has(k))
        .map(([, v]) => v)
    ]),
    notes: joined([
      s?.whyItFits,
      s?.gaps,
      s?.whyMissed,
      s?.specialInstructions,
      ...(s?.eligibilityFlags ?? [])
    ]),
    term: p.term,
    status: joined([
      p.myStatus || 'none',
      p.listing.appStatus !== '-' ? p.listing.appStatus : undefined
    ])
  }
  const folded = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, fold(v)])) as Record<
    SearchField,
    string
  >
  const entry = { raw, folded }
  index.set(p, entry)
  return entry
}

// ---------- Matching and ranking ----------

interface Compiled {
  /** Folded text. */
  text: string
  fields: SearchField[]
  /** Only whole words count (quoted). */
  whole: boolean
}

interface CompiledQuery {
  all: Compiled[]
  any: Compiled[][]
  none: Compiled[]
}

function compile(q: Query): CompiledQuery {
  const one = (t: Term): Compiled => ({
    text: fold(t.text.trim()),
    fields: t.field ? [t.field] : q.scope.length ? q.scope : DEFAULT_FIELDS,
    whole: t.quoted
  })
  const keep = (c: Compiled): boolean => !!c.text
  return {
    all: q.all.map(one).filter(keep),
    any: q.any.map((g) => g.map(one).filter(keep)).filter((g) => g.length),
    none: q.none.map(one).filter(keep)
  }
}

/**
 * 1 when the text has the needle as whole words, 0.6 when only as the start of a longer word,
 * else 0. A match must start at the start of a word, so "script" doesn't find javascript.
 */
function quality(hay: string, needle: string, whole: boolean): number {
  let best = 0
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    if (isWordChar(needle[0]) && isWordChar(hay[i - 1])) continue
    if (!isWordChar(needle[needle.length - 1]) || !isWordChar(hay[i + needle.length])) return 1
    if (!whole) best = 0.6
  }
  return best
}

function termScore(e: Entry, t: Compiled): number {
  let score = 0
  for (const f of t.fields) score += WEIGHTS[f] * quality(e.folded[f], t.text, t.whole)
  // An exact job ID beats everything.
  if (score && e.folded.id === t.text && t.fields.includes('id')) score += 1000
  // Several words in a row are a stronger signal than one.
  return /\s/.test(t.text) ? score * 1.5 : score
}

/** The posting's score, or null when it doesn't match. */
function scoreEntry(e: Entry, q: CompiledQuery): number | null {
  let total = 0
  for (const t of q.all) {
    const s = termScore(e, t)
    if (!s) return null
    total += s
  }
  for (const group of q.any) {
    let s = 0
    for (const t of group) s += termScore(e, t)
    if (!s) return null
    total += s
  }
  for (const t of q.none) if (termScore(e, t)) return null
  return total
}

// Keywords filters ask once per posting, so their parsed queries are kept.
const textQueries = new Map<string, CompiledQuery>()

/** True when the posting matches query text (the Keywords filter). */
export function matchesText(p: Posting, text: string): boolean {
  let query = textQueries.get(text)
  if (!query) {
    if (textQueries.size > 50) textQueries.clear()
    query = compile(parseQuery(text))
    textQueries.set(text, query)
  }
  return scoreEntry(entryOf(p), query) !== null
}

export type SortKey = 'best' | 'match' | 'deadline' | 'newest' | 'org'

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'best', label: 'Best match' },
  { key: 'match', label: 'Match /10' },
  { key: 'deadline', label: 'Closing soonest' },
  { key: 'newest', label: 'Newest' },
  { key: 'org', label: 'Organization' }
]

export interface SearchResult {
  posting: Posting
  score: number
  /** Still on SCOPE and not past its deadline. */
  open: boolean
}

export interface SearchOptions {
  sort?: SortKey
  includeClosed?: boolean
  includeGone?: boolean
  now?: Date
}

const deadlineOf = (r: SearchResult): string => r.posting.listing.deadline ?? '9999'
const matchOf = (r: SearchResult): number => postingMatch(r.posting) ?? -1

// Open postings always come first.
const COMPARE: Record<SortKey, (a: SearchResult, b: SearchResult) => number> = {
  best: (a, b) =>
    +b.open - +a.open ||
    b.score - a.score ||
    matchOf(b) - matchOf(a) ||
    deadlineOf(a).localeCompare(deadlineOf(b)),
  match: (a, b) => +b.open - +a.open || matchOf(b) - matchOf(a) || b.score - a.score,
  deadline: (a, b) => +b.open - +a.open || deadlineOf(a).localeCompare(deadlineOf(b)),
  newest: (a, b) => +b.open - +a.open || b.posting.firstSeen.localeCompare(a.posting.firstSeen),
  org: (a, b) =>
    +b.open - +a.open ||
    a.posting.listing.org.localeCompare(b.posting.listing.org) ||
    a.posting.listing.title.localeCompare(b.posting.listing.title)
}

/**
 * The postings that match, sorted. An empty query matches everything. `hidden` counts matches
 * left out because they are closed or gone from SCOPE.
 */
export function searchPostings(
  postings: Posting[],
  query: Query,
  { sort = 'best', includeClosed = true, includeGone = true, now = new Date() }: SearchOptions = {}
): { results: SearchResult[]; hidden: number } {
  const q = compile(query)
  const results: SearchResult[] = []
  let hidden = 0
  for (const p of postings) {
    const score = scoreEntry(entryOf(p), q)
    if (score === null) continue
    const closed = (daysLeft(p.listing.deadline, now) ?? 0) < 0
    if ((closed && !includeClosed) || (!p.onScopeNow && !includeGone)) {
      hidden++
      continue
    }
    // A better fit wins among postings whose text matches about as well (a title match
    // still beats a fit bonus of at most 5).
    const fit = 0.5 * (postingMatch(p) ?? 0)
    results.push({ posting: p, score: score + fit, open: p.onScopeNow && !closed })
  }
  return { results: results.sort(COMPARE[sort]), hidden }
}

// ---------- Suggestions ----------

/** How many postings have each value of a field, e.g. each organization. */
export function countValues(posts: Posting[], get: (p: Posting) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of posts) {
    const v = get(p)
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return counts
}

/** Values whose words start with every typed word, most common first. Only for plain words. */
export function suggestValues(
  counts: Map<string, number>,
  query: Query,
  limit = 3
): { value: string; count: number }[] {
  if (query.any.length || query.none.length || query.scope.length) return []
  if (!query.all.length || query.all.some((t) => t.field)) return []
  const words = query.all.map((t) => fold(t.text.trim())).filter(Boolean)
  const out: { value: string; count: number }[] = []
  for (const [value, count] of counts) {
    const f = fold(value)
    if (words.every((w) => quality(f, w, false) > 0)) out.push({ value, count })
  }
  return out.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, limit)
}

// ---------- Highlights and snippets ----------

/** A typed word or phrase to mark in text, already folded. */
export interface Mark {
  text: string
  whole: boolean
}

/** What to mark for a query: every word and phrase you asked for (not the ones left out). */
export function marksFor(q: Query): Mark[] {
  return [...q.all, ...q.any.flat()]
    .map((t) => ({ text: fold(t.text.trim()), whole: t.quoted }))
    .filter((m) => m.text)
}

/** Where marks occur in text, as sorted [start, end) ranges that don't overlap. */
export function markRanges(raw: string, marks: Mark[]): [number, number][] {
  if (!raw || !marks.length) return []
  const { text, map } = foldWithMap(raw)
  const at = (i: number): number => (map ? map[i] : i)
  const found: [number, number][] = []
  for (const m of marks) {
    for (let i = text.indexOf(m.text); i >= 0; i = text.indexOf(m.text, i + 1)) {
      if (isWordChar(m.text[0]) && isWordChar(text[i - 1])) continue
      const end = i + m.text.length
      if (m.whole && isWordChar(m.text[m.text.length - 1]) && isWordChar(text[end])) continue
      found.push([at(i), at(end)])
    }
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: [number, number][] = []
  for (const [s, e] of found) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  return merged
}

/** About `length` characters of text around position `at`, cut at spaces. */
function excerpt(text: string, at: number, length: number): string {
  let start = Math.max(0, at - Math.floor(length / 3))
  if (start > 0) {
    const space = text.indexOf(' ', start)
    if (space >= 0 && space < at) start = space + 1
  }
  let end = Math.min(text.length, start + length)
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end)
    if (space > at) end = space
  }
  return `${start > 0 ? '...' : ''}${text.slice(start, end).trim()}${end < text.length ? '...' : ''}`
}

/**
 * A line of posting text for a result: around the first mark in the requirements,
 * description or AI notes, or else the start of the description.
 */
export function snippetOf(p: Posting, marks: Mark[], length = 160): string {
  const e = entryOf(p)
  for (const f of ['req', 'desc', 'notes'] as const) {
    const first = markRanges(e.raw[f], marks)[0]
    if (first) return excerpt(e.raw[f], first[0], length)
  }
  const fallback = e.raw.desc || e.raw.notes
  return fallback ? excerpt(fallback, 0, length) : ''
}
