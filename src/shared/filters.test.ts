import { describe, expect, it } from 'vitest'
import {
  applyFilters,
  describeCondition,
  fieldById,
  isActive,
  newCondition,
  optionsFor,
  regionOf,
  SHEET_FIELDS,
  validConditions,
  withOp,
  type ChoiceField,
  type Condition,
  type FilterContext
} from './filters'
import type { Posting, RunRecord } from './types'

const now = new Date('2026-10-05T12:00')
const ctx: FilterContext = { now, lastRun: null }

function make(
  id: string,
  change: Partial<Posting> = {},
  listing: Partial<Posting['listing']> = {}
): Posting {
  return {
    id,
    term: 'W27',
    listing: {
      title: `Title ${id}`,
      org: 'Org',
      location: 'Vancouver, BC',
      deadlineText: '',
      deadline: '2026-10-20T09:00',
      applicants: 5,
      appStatus: '-',
      ...listing
    },
    firstSeen: '2026-10-01T00:00:00.000Z',
    lastSeen: '2026-10-05T00:00:00.000Z',
    onScopeNow: true,
    myStatus: '',
    ...change
  }
}

const ids = (ps: Posting[]): string[] => ps.map((p) => p.id)
const run = (conds: Condition[], ps: Posting[], c = ctx): string[] =>
  ids(applyFilters(ps, conds, c))

describe('number conditions', () => {
  const ps = [
    make('fit2', { score: { section: 'pick', fit: 2 } }),
    make('fit4', { score: { section: 'pick', fit: 4 } }),
    make('unscored')
  ]

  it('compares values and treats a missing value as no match', () => {
    expect(run([{ field: 'fit', op: 'gte', value: 3 }], ps)).toEqual(['fit4'])
    expect(run([{ field: 'fit', op: 'lte', value: 3 }], ps)).toEqual(['fit2'])
    expect(run([{ field: 'fit', op: 'between', value: [5, 1] }], ps)).toEqual(['fit2', 'fit4'])
    expect(run([{ field: 'fit', op: 'empty' }], ps)).toEqual(['unscored'])
    expect(run([{ field: 'match', op: 'notEmpty' }], ps)).toEqual([])
  })

  it('needs every condition to match', () => {
    const conds: Condition[] = [
      { field: 'fit', op: 'gte', value: 1 },
      { field: 'fit', op: 'lte', value: 2 }
    ]
    expect(run(conds, ps)).toEqual(['fit2'])
  })
})

describe('dates', () => {
  const ps = [
    make('soon', {}, { deadline: '2026-10-07T09:00' }),
    make('later', {}, { deadline: '2026-10-30T09:00' }),
    make('closed', {}, { deadline: '2026-10-01T09:00' }),
    make('none', {}, { deadline: null })
  ]

  it('leaves closed postings out of "closes within"', () => {
    expect(run([{ field: 'closesIn', op: 'lte', value: 7 }], ps)).toEqual(['soon'])
    expect(run([{ field: 'closesIn', op: 'gte', value: 7 }], ps)).toEqual(['later'])
  })

  it('tells closed postings apart', () => {
    expect(run([{ field: 'closed', op: 'is', value: true }], ps)).toEqual(['closed'])
    expect(run([{ field: 'closed', op: 'is', value: false }], ps)).toEqual([
      'soon',
      'later',
      'none'
    ])
  })

  it('counts days since first seen and newness from the last run', () => {
    const fresh = make('fresh', { firstSeen: '2026-10-04T12:00:00.000Z' })
    const all = [...ps, fresh]
    expect(run([{ field: 'firstSeen', op: 'lte', value: 2 }], all)).toEqual(['fresh'])
    const lastRun = { startedAt: '2026-10-04T00:00:00.000Z' } as RunRecord
    expect(run([{ field: 'isNew', op: 'is', value: true }], all, { now, lastRun })).toEqual([
      'fresh'
    ])
  })
})

describe('text and choice conditions', () => {
  const ps = [
    make('dev', { myStatus: 'Applied' }, { title: 'Développeur Junior', org: 'Shopify' }),
    make('data', { myStatus: 'Skip' }, { title: 'Data Analyst', location: 'Toronto, ON' }),
    make('ml', {}, { title: 'ML Intern', location: 'Montréal, QC' })
  ]

  it('matches text without case or accents', () => {
    expect(run([{ field: 'title', op: 'contains', value: 'DEVELOPPEUR' }], ps)).toEqual(['dev'])
    expect(run([{ field: 'location', op: 'contains', value: 'montreal' }], ps)).toEqual(['ml'])
    expect(run([{ field: 'title', op: 'notContains', value: 'intern' }], ps)).toEqual([
      'dev',
      'data'
    ])
  })

  it('matches choices', () => {
    expect(run([{ field: 'myStatus', op: 'in', value: ['Applied', ''] }], ps)).toEqual([
      'dev',
      'ml'
    ])
    expect(run([{ field: 'myStatus', op: 'notIn', value: ['Skip'] }], ps)).toEqual(['dev', 'ml'])
    expect(run([{ field: 'region', op: 'in', value: ['ON', 'QC'] }], ps)).toEqual(['data', 'ml'])
  })

  it('ignores conditions that are still missing a value', () => {
    const unfinished: Condition[] = [
      { field: 'title', op: 'contains', value: '  ' },
      { field: 'org', op: 'in', value: [] },
      { field: 'fit', op: 'gte', value: NaN }
    ]
    expect(unfinished.some(isActive)).toBe(false)
    expect(run(unfinished, ps)).toEqual(['dev', 'data', 'ml'])
  })
})

describe('regions', () => {
  it('reads the province or state code', () => {
    expect(regionOf('Toronto, ON')).toBe('ON')
    expect(regionOf('San Mateo, CA')).toBe('CA')
    expect(regionOf('Ottawa, ON & Toronto, ON ')).toBe('ON')
    expect(regionOf('Various Locations')).toBe('')
  })
})

describe('options', () => {
  it('counts values, keeping a fixed order where the field has one', () => {
    const ps = [make('a', { myStatus: 'Applied' }), make('b', { myStatus: 'Applied' }), make('c')]
    const status = optionsFor(fieldById('myStatus') as ChoiceField, ps)
    expect(status.map((o) => [o.name, o.count])).toEqual([
      ['None', 1],
      ['To apply', 0],
      ['Drafting', 0],
      ['Applied', 2],
      ['Skip', 0]
    ])
    const region = optionsFor(fieldById('region') as ChoiceField, [
      make('x', {}, { location: 'Toronto, ON' }),
      make('y', {}, { location: 'Ottawa, ON' }),
      make('z', {}, { location: 'Remote' })
    ])
    expect(region.map((o) => [o.name, o.count])).toEqual([
      ['Ontario', 2],
      ['Other or several', 1]
    ])
  })
})

describe('chip text', () => {
  it('describes conditions in plain words', () => {
    expect(describeCondition({ field: 'match', op: 'gte', value: 7 })).toBe('Match /10 ≥ 7')
    expect(describeCondition({ field: 'closesIn', op: 'lte', value: 3 })).toBe(
      'Closes within 3 days'
    )
    expect(describeCondition({ field: 'fit', op: 'between', value: [2, 4] })).toBe(
      'Fit /5 from 2 to 4'
    )
    expect(describeCondition({ field: 'closed', op: 'is', value: false })).toBe('Still open')
    expect(
      describeCondition({
        field: 'location',
        op: 'in',
        value: ['Toronto, ON', 'Vancouver, BC', 'Ottawa, ON']
      })
    ).toBe('Location is Toronto, ON or Vancouver, BC +1')
    expect(describeCondition({ field: 'myStatus', op: 'notIn', value: [''] })).toBe(
      'Your status is not None'
    )
    expect(describeCondition({ field: 'org', op: 'contains', value: 'bank' })).toBe(
      'Organization contains "bank"'
    )
    expect(describeCondition({ field: 'match', op: 'empty' })).toBe('No match score')
  })
})

describe('editing', () => {
  it('starts each field with its first operator and no value', () => {
    expect(newCondition(fieldById('match')!)).toEqual({ field: 'match', op: 'gte', value: NaN })
    expect(newCondition(fieldById('org')!)).toEqual({ field: 'org', op: 'in', value: [] })
    expect(newCondition(fieldById('title')!)).toEqual({
      field: 'title',
      op: 'contains',
      value: ''
    })
    expect(newCondition(fieldById('read')!)).toEqual({ field: 'read', op: 'is', value: true })
  })

  it('keeps what fits when the operator changes', () => {
    const c: Condition = { field: 'fit', op: 'gte', value: 3 }
    expect(withOp(c, 'between')).toEqual({ field: 'fit', op: 'between', value: [3, NaN] })
    expect(withOp({ field: 'fit', op: 'between', value: [2, 4] }, 'lte')).toEqual({
      field: 'fit',
      op: 'lte',
      value: 2
    })
    expect(withOp({ field: 'org', op: 'in', value: ['A'] }, 'notIn')).toEqual({
      field: 'org',
      op: 'notIn',
      value: ['A']
    })
    expect(withOp({ field: 'org', op: 'in', value: ['A'] }, 'contains')).toEqual({
      field: 'org',
      op: 'contains',
      value: ''
    })
  })
})

describe('stored conditions', () => {
  it('drops unknown, malformed and unfinished ones', () => {
    const raw = [
      { field: 'match', op: 'gte', value: 7 },
      { field: 'nope', op: 'gte', value: 7 },
      { field: 'match', op: 'contains', value: 'x' },
      { field: 'fit', op: 'between', value: [1, 'x'] },
      { field: 'title', op: 'contains', value: '' },
      { field: 'read', op: 'is', value: 'yes' },
      { field: 'match', op: 'gte', value: null },
      'junk'
    ]
    expect(validConditions(raw)).toEqual([{ field: 'match', op: 'gte', value: 7 }])
    expect(validConditions({ not: 'a list' })).toEqual([])
  })
})

describe('keywords and sheets', () => {
  it('runs a search for Keywords', () => {
    const ps = [
      make('a', { details: { 'Job Description': 'Python and SQL every day' } }),
      make('b', {}, { title: 'Python Senior Developer' })
    ]
    expect(run([{ field: 'keywords', op: 'contains', value: 'python -senior' }], ps)).toEqual(['a'])
    expect(run([{ field: 'keywords', op: 'notContains', value: 'sql' }], ps)).toEqual(['b'])
    expect(describeCondition({ field: 'keywords', op: 'contains', value: 'python' })).toBe(
      'Mentions python'
    )
  })

  it('knows which sheet a posting is on', () => {
    const ps = [
      make('pick', { score: { section: 'pick' } }),
      make('near', { score: { section: 'near' } }),
      make('none')
    ]
    expect(run([{ field: 'sheet', op: 'in', value: ['near', ''] }], ps)).toEqual(['near', 'none'])
    expect(SHEET_FIELDS.some((f) => f.id === 'sheet')).toBe(false)
  })
})
