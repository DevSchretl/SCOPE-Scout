// Filters for the Postings and Search pages: conditions on posting fields, all of which
// must match. Pure functions, so the UI and the tests share one engine.

import { NEW_PICK_MIN_MATCH, QUICK_SEARCHES } from './config'
import { daysLeft, isNewIn, postingMatch } from './derive'
import { matchesText } from './search'
import { SHEETS } from './sheets'
import { fold } from './text'
import { MY_STATUSES, type Posting, type RunRecord } from './types'

export interface FilterContext {
  now: Date
  lastRun: RunRecord | null
}

/** A context for filtering right now. */
export function filterContext(lastRun: RunRecord | null): FilterContext {
  return { now: new Date(), lastRun }
}

export type NumberOp = 'gte' | 'lte' | 'between' | 'empty' | 'notEmpty'
export type TextOp = 'contains' | 'notContains'
export type ChoiceOp = 'in' | 'notIn'

export type Condition =
  | { field: string; op: 'gte' | 'lte'; value: number }
  | { field: string; op: 'between'; value: [number, number] }
  | { field: string; op: 'empty' | 'notEmpty' }
  | { field: string; op: TextOp; value: string }
  | { field: string; op: ChoiceOp; value: string[] }
  | { field: string; op: 'is'; value: boolean }

export type Op = Condition['op']

export type FieldGroup = 'Score' | 'Posting' | 'Dates' | 'Status'
export const FIELD_GROUPS: FieldGroup[] = ['Score', 'Posting', 'Dates', 'Status']

interface FieldBase {
  id: string
  label: string
  group: FieldGroup
  /** Operator names in the editor where the defaults ("at least", ...) read badly. */
  opLabels?: Partial<Record<Op, string>>
  /**
   * Chip text per operator: {label} is the field, {n} a number, {a} and {b} a range,
   * {v} the text typed.
   */
  chips?: Partial<Record<Op, string>>
}

export interface NumberField extends FieldBase {
  type: 'number'
  get: (p: Posting, ctx: FilterContext) => number | null
  ops: NumberOp[]
  step: number
  unit?: string
}

export interface TextField extends FieldBase {
  type: 'text'
  get: (p: Posting) => string
  /** Decides "contains" in place of a plain substring test (Keywords runs a search). */
  match?: (p: Posting, text: string) => boolean
}

export interface ChoiceField extends FieldBase {
  type: 'choice'
  get: (p: Posting) => string
  /** These values are always offered, in this order. */
  order?: string[]
  /** Display name of a value. */
  name?: (value: string) => string
  /** Also offer "contains", for long lists such as organizations. */
  text?: boolean
}

export interface BoolField extends FieldBase {
  type: 'bool'
  get: (p: Posting, ctx: FilterContext) => boolean
  /** Chip text for yes and for no. */
  yes: string
  no: string
}

export type Field = NumberField | TextField | ChoiceField | BoolField

const DAY_MS = 86_400_000

const PROVINCES: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon'
}
const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY'.split(
    ' '
  )
)

/** "Toronto, ON" gives "ON". Locations without a two-letter code give "". */
export function regionOf(location: string): string {
  return /,\s*([A-Z]{2})\s*$/.exec(location)?.[1] ?? ''
}

function regionName(code: string): string {
  if (!code) return 'Other or several'
  return PROVINCES[code] ?? (US_STATES.has(code) ? `${code} (US)` : code)
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
/** For values from the AI score, which unscored postings don't have. */
const scoredName = (v: string): string => (v ? capitalize(v) : 'Not scored')

const VERDICTS: Record<string, string> = {
  pick: 'Pick',
  near: 'Near miss',
  none: 'Not a fit',
  unscored: 'Not scored'
}

export const FIELDS: Field[] = [
  {
    id: 'match',
    label: 'Match /10',
    group: 'Score',
    type: 'number',
    get: (p) => postingMatch(p),
    ops: ['gte', 'lte', 'between', 'empty', 'notEmpty'],
    opLabels: { empty: 'has no score', notEmpty: 'has a score' },
    chips: { empty: 'No match score', notEmpty: 'Has a match score' },
    step: 0.5
  },
  {
    id: 'fit',
    label: 'Fit /5',
    group: 'Score',
    type: 'number',
    get: (p) => p.score?.fit ?? null,
    ops: ['gte', 'lte', 'between', 'empty'],
    opLabels: { empty: 'not rated' },
    chips: { empty: 'No fit rating' },
    step: 1
  },
  {
    id: 'unmet',
    label: 'Unmet requirements',
    group: 'Score',
    type: 'number',
    get: (p) => {
      const s = p.score
      return s?.requiredTotal != null && s.requiredMet != null
        ? s.requiredTotal - s.requiredMet
        : null
    },
    ops: ['lte', 'gte', 'empty'],
    opLabels: { empty: 'not counted' },
    chips: { empty: 'Requirements not counted' },
    step: 0.5
  },
  {
    id: 'verdict',
    label: 'AI verdict',
    group: 'Score',
    type: 'choice',
    get: (p) => p.score?.section ?? 'unscored',
    order: Object.keys(VERDICTS),
    name: (v) => VERDICTS[v] ?? v
  },
  {
    id: 'keywords',
    label: 'Keywords',
    group: 'Posting',
    type: 'text',
    get: (p) => p.listing.title,
    // The same matching and syntax as the search box, over the whole posting.
    match: matchesText,
    opLabels: { contains: 'mentions', notContains: "doesn't mention" },
    chips: { contains: 'Mentions {v}', notContains: "Doesn't mention {v}" }
  },
  { id: 'title', label: 'Title', group: 'Posting', type: 'text', get: (p) => p.listing.title },
  {
    id: 'org',
    label: 'Organization',
    group: 'Posting',
    type: 'choice',
    get: (p) => p.listing.org,
    text: true
  },
  {
    id: 'location',
    label: 'Location',
    group: 'Posting',
    type: 'choice',
    get: (p) => p.listing.location,
    text: true
  },
  {
    id: 'region',
    label: 'Province or state',
    group: 'Posting',
    type: 'choice',
    get: (p) => regionOf(p.listing.location),
    name: regionName
  },
  {
    id: 'term',
    label: 'Term',
    group: 'Posting',
    type: 'choice',
    get: (p) => p.term,
    order: QUICK_SEARCHES.map((q) => q.term)
  },
  {
    id: 'workMode',
    label: 'Work mode',
    group: 'Posting',
    type: 'choice',
    get: (p) => p.score?.workMode ?? '',
    name: scoredName
  },
  {
    id: 'coverLetter',
    label: 'Cover letter',
    group: 'Posting',
    type: 'choice',
    get: (p) => p.score?.coverLetter ?? '',
    name: scoredName
  },
  {
    id: 'applyVia',
    label: 'Apply via',
    group: 'Posting',
    type: 'choice',
    get: (p) => p.score?.applyVia ?? '',
    name: scoredName
  },
  {
    id: 'applicants',
    label: 'Applicants',
    group: 'Posting',
    type: 'number',
    get: (p) => p.listing.applicants,
    ops: ['lte', 'gte', 'between', 'empty'],
    opLabels: { empty: 'unknown' },
    chips: { empty: 'Applicants unknown' },
    step: 1
  },
  {
    id: 'closesIn',
    label: 'Closes in',
    group: 'Dates',
    type: 'number',
    // Closed postings have no "closes in", so they never match.
    get: (p, ctx) => {
      const d = daysLeft(p.listing.deadline, ctx.now)
      return d === null || d < 0 ? null : d
    },
    ops: ['lte', 'gte', 'between'],
    opLabels: { lte: 'within', gte: 'at least' },
    chips: {
      lte: 'Closes within {n} days',
      gte: 'Closes in {n}+ days',
      between: 'Closes in {a} to {b} days'
    },
    step: 1,
    unit: 'days'
  },
  {
    id: 'closed',
    label: 'Deadline passed',
    group: 'Dates',
    type: 'bool',
    get: (p, ctx) => (daysLeft(p.listing.deadline, ctx.now) ?? 0) < 0,
    yes: 'Deadline passed',
    no: 'Still open'
  },
  {
    id: 'firstSeen',
    label: 'First seen',
    group: 'Dates',
    type: 'number',
    get: (p, ctx) => {
      const t = Date.parse(p.firstSeen)
      return Number.isNaN(t) ? null : (ctx.now.getTime() - t) / DAY_MS
    },
    ops: ['lte'],
    opLabels: { lte: 'in the last' },
    chips: { lte: 'First seen in the last {n} days' },
    step: 1,
    unit: 'days'
  },
  {
    id: 'isNew',
    label: 'New since last scan',
    group: 'Dates',
    type: 'bool',
    get: (p, ctx) => isNewIn(p, ctx.lastRun),
    yes: 'New since last scan',
    no: 'Not new'
  },
  {
    id: 'myStatus',
    label: 'Your status',
    group: 'Status',
    type: 'choice',
    get: (p) => p.myStatus,
    order: MY_STATUSES,
    name: (v) => v || 'None'
  },
  {
    id: 'appliedOnScope',
    label: 'Applied on SCOPE',
    group: 'Status',
    type: 'bool',
    get: (p) => !!p.listing.appStatus && p.listing.appStatus !== '-',
    yes: 'Applied on SCOPE',
    no: 'Not applied on SCOPE'
  },
  {
    id: 'onScope',
    label: 'Still on SCOPE',
    group: 'Status',
    type: 'bool',
    get: (p) => p.onScopeNow,
    yes: 'Still on SCOPE',
    no: 'Gone from SCOPE'
  },
  {
    id: 'read',
    label: 'Read in full',
    group: 'Status',
    type: 'bool',
    get: (p) => !!p.details,
    yes: 'Read in full',
    no: 'Not read in full'
  },
  {
    id: 'special',
    label: 'Special instructions',
    group: 'Status',
    type: 'bool',
    get: (p) => !!p.score?.specialInstructions,
    yes: 'Has special instructions',
    no: 'No special instructions'
  },
  {
    id: 'planted',
    label: 'Planted AI instruction',
    group: 'Status',
    type: 'bool',
    get: (p) => !!p.score?.plantedInstruction,
    yes: 'Planted AI instruction',
    no: 'No planted instruction'
  },
  {
    id: 'sheet',
    label: 'Sheet',
    group: 'Status',
    type: 'choice',
    get: (p) => SHEETS.find((s) => s.kind !== 'all' && s.test(p))?.id ?? '',
    order: SHEETS.filter((s) => s.kind !== 'all').map((s) => s.id),
    name: (v) => SHEETS.find((s) => s.id === v)?.label ?? 'Not picked'
  }
]

/** The Postings page leaves out Sheet, since its dropdown already picks one. */
export const SHEET_FIELDS = FIELDS.filter((f) => f.id !== 'sheet')

const BY_ID = new Map(FIELDS.map((f) => [f.id, f]))

export function fieldById(id: string): Field | undefined {
  return BY_ID.get(id)
}

/** One-click conditions offered above the field list. */
export const PRESETS: { label: string; condition: Condition }[] = [
  { label: 'Hide closed', condition: { field: 'closed', op: 'is', value: false } },
  {
    label: `Match ${NEW_PICK_MIN_MATCH}+`,
    condition: { field: 'match', op: 'gte', value: NEW_PICK_MIN_MATCH }
  },
  { label: 'Closes within 7 days', condition: { field: 'closesIn', op: 'lte', value: 7 } },
  { label: 'New since last scan', condition: { field: 'isNew', op: 'is', value: true } },
  { label: 'Hide skipped', condition: { field: 'myStatus', op: 'notIn', value: ['Skip'] } }
]

export function sameCondition(a: Condition, b: Condition): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function opsFor(field: Field): Op[] {
  switch (field.type) {
    case 'number':
      return field.ops
    case 'text':
      return ['contains', 'notContains']
    case 'choice':
      return field.text ? ['in', 'notIn', 'contains', 'notContains'] : ['in', 'notIn']
    case 'bool':
      return ['is']
  }
}

const OP_LABELS: Record<Op, string> = {
  gte: 'at least',
  lte: 'at most',
  between: 'between',
  empty: 'is empty',
  notEmpty: 'has a value',
  contains: 'contains',
  notContains: "doesn't contain",
  in: 'is any of',
  notIn: 'is none of',
  is: 'is'
}

export function opLabel(field: Field, op: Op): string {
  return field.opLabels?.[op] ?? OP_LABELS[op]
}

/** An empty condition for a field; it filters nothing until it has a value. */
export function newCondition(field: Field): Condition {
  return withOp({ field: field.id, op: 'contains', value: '' }, opsFor(field)[0])
}

/** The same condition with another operator, keeping as much of the value as fits. */
export function withOp(c: Condition, op: Op): Condition {
  const field = c.field
  const v = 'value' in c ? c.value : undefined
  const range = Array.isArray(v) && typeof v[0] === 'number' ? (v as [number, number]) : null
  const num = typeof v === 'number' ? v : range ? range[0] : NaN
  switch (op) {
    case 'gte':
    case 'lte':
      return { field, op, value: num }
    case 'between':
      return { field, op, value: range ?? [num, NaN] }
    case 'empty':
    case 'notEmpty':
      return { field, op }
    case 'contains':
    case 'notContains':
      return { field, op, value: typeof v === 'string' ? v : '' }
    case 'in':
    case 'notIn':
      return { field, op, value: Array.isArray(v) && !range ? (v as string[]) : [] }
    case 'is':
      return { field, op, value: typeof v === 'boolean' ? v : true }
  }
}

/** False while a condition is still missing its value. */
export function isActive(c: Condition): boolean {
  switch (c.op) {
    case 'gte':
    case 'lte':
      return Number.isFinite(c.value)
    case 'between':
      return Number.isFinite(c.value[0]) && Number.isFinite(c.value[1])
    case 'contains':
    case 'notContains':
      return c.value.trim() !== ''
    case 'in':
    case 'notIn':
      return c.value.length > 0
    default:
      return true
  }
}

export function testCondition(c: Condition, p: Posting, ctx: FilterContext): boolean {
  const f = fieldById(c.field)
  if (!f || !isActive(c)) return true
  switch (c.op) {
    case 'gte':
    case 'lte':
    case 'between':
    case 'empty':
    case 'notEmpty': {
      if (f.type !== 'number') return true
      const v = f.get(p, ctx)
      if (c.op === 'empty') return v === null
      if (v === null) return false
      if (c.op === 'notEmpty') return true
      if (c.op === 'gte') return v >= c.value
      if (c.op === 'lte') return v <= c.value
      if (c.op === 'between') {
        const [a, b] = c.value
        return v >= Math.min(a, b) && v <= Math.max(a, b)
      }
      return true
    }
    case 'contains':
    case 'notContains': {
      if (f.type !== 'text' && f.type !== 'choice') return true
      const text = c.value.trim()
      const hit =
        f.type === 'text' && f.match ? f.match(p, text) : fold(f.get(p)).includes(fold(text))
      return c.op === 'contains' ? hit : !hit
    }
    case 'in':
    case 'notIn': {
      if (f.type !== 'choice') return true
      const hit = c.value.includes(f.get(p))
      return c.op === 'in' ? hit : !hit
    }
    case 'is':
      return f.type !== 'bool' || f.get(p, ctx) === c.value
  }
}

export function applyFilters(
  postings: Posting[],
  conditions: Condition[],
  ctx: FilterContext
): Posting[] {
  const active = conditions.filter(isActive)
  if (!active.length) return postings
  return postings.filter((p) => active.every((c) => testCondition(c, p, ctx)))
}

export function choiceName(field: ChoiceField, value: string): string {
  return field.name ? field.name(value) : value || '(blank)'
}

export interface ChoiceOption {
  value: string
  name: string
  count: number
}

/** The values of a choice field among some postings, most common first (or in the field's order). */
export function optionsFor(field: ChoiceField, postings: Posting[]): ChoiceOption[] {
  const counts = new Map<string, number>((field.order ?? []).map((v) => [v, 0]))
  for (const p of postings) {
    const v = field.get(p)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const options = [...counts].map(([value, count]) => ({
    value,
    name: choiceName(field, value),
    count
  }))
  const order = field.order
  if (order) {
    const rank = (v: string): number => (order.includes(v) ? order.indexOf(v) : order.length)
    return options.sort((a, b) => rank(a.value) - rank(b.value) || b.count - a.count)
  }
  return options.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

const NUMBER_CHIPS: Record<NumberOp, string> = {
  gte: '{label} ≥ {n}',
  lte: '{label} ≤ {n}',
  between: '{label} from {a} to {b}',
  empty: '{label} is empty',
  notEmpty: '{label} has a value'
}

const shown = (n: number): string => (Number.isFinite(n) ? String(n) : '...')

/** "Match /10 ≥ 7", "Location is Toronto, ON or Vancouver, BC", "Still open". */
export function describeCondition(c: Condition): string {
  const f = fieldById(c.field)
  if (!f) return ''
  switch (c.op) {
    case 'gte':
    case 'lte':
    case 'between':
    case 'empty':
    case 'notEmpty': {
      const template = f.chips?.[c.op] ?? NUMBER_CHIPS[c.op]
      const text = template.replace('{label}', f.label)
      if (c.op === 'between')
        return text.replace('{a}', shown(c.value[0])).replace('{b}', shown(c.value[1]))
      return c.op === 'gte' || c.op === 'lte' ? text.replace('{n}', shown(c.value)) : text
    }
    case 'contains':
    case 'notContains': {
      const text = c.value.trim() || '...'
      const template = f.chips?.[c.op]
      if (template) return template.replace('{label}', f.label).replace('{v}', text)
      return `${f.label} ${c.op === 'contains' ? 'contains' : "doesn't contain"} "${text}"`
    }
    case 'in':
    case 'notIn': {
      const names = f.type === 'choice' ? c.value.map((v) => choiceName(f, v)) : c.value
      const list = names.length
        ? names.slice(0, 2).join(' or ') + (names.length > 2 ? ` +${names.length - 2}` : '')
        : '...'
      return `${f.label} ${c.op === 'in' ? 'is' : 'is not'} ${list}`
    }
    case 'is':
      return f.type === 'bool' ? (c.value ? f.yes : f.no) : f.label
  }
}

function isValid(c: unknown): c is Condition {
  if (!c || typeof c !== 'object') return false
  const { field, op, value } = c as Record<string, unknown>
  const f = typeof field === 'string' ? fieldById(field) : undefined
  if (!f || !opsFor(f).includes(op as Op)) return false
  switch (op as Op) {
    case 'gte':
    case 'lte':
      return typeof value === 'number'
    case 'between':
      return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number')
    case 'empty':
    case 'notEmpty':
      return true
    case 'contains':
    case 'notContains':
      return typeof value === 'string'
    case 'in':
    case 'notIn':
      return Array.isArray(value) && value.every((v) => typeof v === 'string')
    case 'is':
      return typeof value === 'boolean'
  }
}

/** Conditions read back from storage: anything unknown, malformed or unfinished is dropped. */
export function validConditions(raw: unknown): Condition[] {
  return Array.isArray(raw) ? raw.filter(isValid).filter(isActive) : []
}
